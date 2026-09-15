import ExpoModulesCore
import CoreBluetooth

// ── Constants ──
// Custom UUIDs for NextVibe BLE sharing (must match the Android module)
private let kServiceUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
private let kCharacteristicUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

// Proximity thresholds (average RSSI over the last few advertisements).
// "passive" is the always-on app-wide scanner: phones must be really close.
// "active" is used while the user has a tap screen open and is deliberately
// holding phones together — looser, so cases/hands/orientation don't block it.
private let kPassiveRSSIThreshold: Double = -50
private let kActiveRSSIThreshold: Double = -62
private let kRSSIFilterWindow = 3
private let kMinRSSISamples = 2

// When several phones cross the threshold at once, wait this long and pick
// the strongest one instead of whichever advertised first.
private let kSelectionWindow: TimeInterval = 0.35

// A connection that hasn't produced the payload by now is abandoned.
private let kConnectTimeout: TimeInterval = 6.0

// Per-device cooldowns. After a successful read JS dedups per token/person, so
// the native side only needs to avoid reconnecting to a phone that simply
// stays next to this one; after a failure it can be retried almost at once.
private let kSuccessCooldown: TimeInterval = 15.0
private let kFailureCooldown: TimeInterval = 1.5

private func bluetoothStateString(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "poweredOn"
    case .poweredOff: return "poweredOff"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "unknown"
    }
}

public class BleShareModule: Module {

    // ── Peripheral (Broadcaster) state ──
    // One manager for the module's lifetime: recreating it on every token
    // rotation dropped the advertisement and re-ran state callbacks.
    private var peripheralManager: CBPeripheralManager?
    private var peripheralDelegate: PeripheralDelegate?
    fileprivate var payload = Data()
    fileprivate var isBroadcastRequested = false
    private var serviceAdded = false
    private var serviceAdding = false

    // ── Central (Scanner) state ──
    private var centralManager: CBCentralManager?
    private var centralDelegate: CentralDelegate?
    fileprivate var isScanningRequested = false
    fileprivate var rssiThreshold: Double = kPassiveRSSIThreshold

    public func definition() -> ModuleDefinition {
        Name("BleShare")

        Events("onBleRead", "onBleDiscovered", "onBluetoothStateChanged", "onBroadcastError", "onScanError")

        // Reads the state of whichever manager exists. Deliberately does NOT
        // create one: instantiating a manager triggers the system permission
        // prompt, so before any start* call the state is "unknown".
        Function("getBluetoothState") { () -> String in
            if let cm = self.centralManager {
                return bluetoothStateString(cm.state)
            }
            if let pm = self.peripheralManager {
                return bluetoothStateString(pm.state)
            }
            if CBManager.authorization == .denied || CBManager.authorization == .restricted {
                return "unauthorized"
            }
            return "unknown"
        }

        // Permission status without prompting.
        Function("getBluetoothAuthorization") { () -> String in
            switch CBManager.authorization {
            case .allowedAlways: return "granted"
            case .denied: return "denied"
            case .restricted: return "restricted"
            case .notDetermined: return "notDetermined"
            @unknown default: return "notDetermined"
            }
        }

        Function("isBroadcastSupported") { () -> Bool in
            return true
        }

        Function("setScanSensitivity") { (mode: String) in
            DispatchQueue.main.async {
                self.rssiThreshold = mode == "active" ? kActiveRSSIThreshold : kPassiveRSSIThreshold
            }
        }

        // ── Broadcaster API ──

        // Safe to call repeatedly: a new payload while already advertising is
        // swapped in place (reads are served on demand), no restart needed.
        Function("startBroadcasting") { (url: String) in
            DispatchQueue.main.async {
                self.payload = url.data(using: .utf8) ?? Data()
                self.isBroadcastRequested = true
                self.startPeripheral()
            }
        }

        Function("stopBroadcasting") {
            DispatchQueue.main.async {
                self.stopPeripheral()
            }
        }

        // ── Scanner API ──

        Function("startScanning") {
            DispatchQueue.main.async {
                self.isScanningRequested = true
                self.startCentral()
            }
        }

        Function("stopScanning") {
            DispatchQueue.main.async {
                self.isScanningRequested = false
                self.stopCentral()
            }
        }

        OnDestroy {
            self.stopPeripheral()
            self.isScanningRequested = false
            self.stopCentral()
        }
    }

    // ═══════════════════════════════════════
    // MARK: – Peripheral (Broadcaster) Logic
    // ═══════════════════════════════════════

    private func startPeripheral() {
        if peripheralManager == nil {
            let delegate = PeripheralDelegate()
            delegate.module = self
            peripheralDelegate = delegate
            peripheralManager = CBPeripheralManager(delegate: delegate, queue: .main)
            // Advertising starts from peripheralManagerDidUpdateState.
            return
        }
        ensureAdvertising()
    }

    fileprivate func ensureAdvertising() {
        guard isBroadcastRequested, let pm = peripheralManager, pm.state == .poweredOn else { return }

        if !serviceAdded {
            guard !serviceAdding else { return }
            // Dynamic value (nil): iOS asks us on every read, so the payload
            // can rotate in place and didReceiveRead actually fires. A cached
            // value is served by the OS and never reaches the delegate.
            let char = CBMutableCharacteristic(
                type: kCharacteristicUUID,
                properties: [.read],
                value: nil,
                permissions: [.readable]
            )
            let service = CBMutableService(type: kServiceUUID, primary: true)
            service.characteristics = [char]
            serviceAdding = true
            pm.add(service)
            return
        }

        if !pm.isAdvertising {
            pm.startAdvertising([
                CBAdvertisementDataServiceUUIDsKey: [kServiceUUID]
            ])
        }
    }

    fileprivate func serviceDidAdd(error: Error?) {
        serviceAdding = false
        if let error = error {
            sendEvent("onBroadcastError", ["code": "service_add_failed", "message": error.localizedDescription])
            return
        }
        serviceAdded = true
        ensureAdvertising()
    }

    fileprivate func advertisingDidStart(error: Error?) {
        if let error = error {
            sendEvent("onBroadcastError", ["code": "advertise_failed", "message": error.localizedDescription])
        }
    }

    fileprivate func peripheralStateDidChange(_ state: CBManagerState) {
        sendEvent("onBluetoothStateChanged", ["state": bluetoothStateString(state)])
        if state == .poweredOn {
            ensureAdvertising()
        } else {
            // Published services are dropped when Bluetooth goes down.
            serviceAdded = false
            serviceAdding = false
        }
    }

    private func stopPeripheral() {
        isBroadcastRequested = false
        payload = Data()
        peripheralDelegate?.resetBroadcastSession()
        if let pm = peripheralManager {
            if pm.isAdvertising {
                pm.stopAdvertising()
            }
            pm.removeAllServices()
        }
        serviceAdded = false
        serviceAdding = false
    }

    // ═══════════════════════════════════════
    // MARK: – Central (Scanner) Logic
    // ═══════════════════════════════════════

    private func startCentral() {
        if centralManager == nil {
            let delegate = CentralDelegate()
            delegate.module = self
            delegate.onDiscovered = { [weak self] url, rssi in
                self?.sendEvent("onBleDiscovered", ["url": url, "rssi": rssi])
            }
            centralDelegate = delegate
            let manager = CBCentralManager(delegate: delegate, queue: .main)
            delegate.centralManager = manager
            centralManager = manager
            // Scanning starts from centralManagerDidUpdateState.
            return
        }
        if let cm = centralManager, cm.state == .poweredOn, !cm.isScanning {
            cm.scanForPeripherals(
                withServices: [kServiceUUID],
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
            )
        }
    }

    private func stopCentral() {
        if let cm = centralManager, cm.state == .poweredOn, cm.isScanning {
            cm.stopScan()
        }
        centralDelegate?.disconnectAndReset()
    }
}

// ═══════════════════════════════════════
// MARK: – Peripheral Delegate
// ═══════════════════════════════════════

private class PeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
    weak var module: BleShareModule?

    // Payload each central was last reported for during this broadcast session:
    // one onBleRead per central per code — a neighbour that keeps re-reading
    // the same code is not a new tap.
    private var notifiedPayloads: [UUID: Data] = [:]

    func resetBroadcastSession() {
        notifiedPayloads.removeAll()
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        module?.peripheralStateDidChange(peripheral.state)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        module?.serviceDidAdd(error: error)
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        module?.advertisingDidStart(error: error)
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didReceiveRead request: CBATTRequest
    ) {
        guard request.characteristic.uuid == kCharacteristicUUID else {
            peripheral.respond(to: request, withResult: .attributeNotFound)
            return
        }
        guard let module = module, module.isBroadcastRequested, !module.payload.isEmpty else {
            peripheral.respond(to: request, withResult: .readNotPermitted)
            return
        }

        let value = module.payload
        let offset = request.offset
        if offset > value.count {
            peripheral.respond(to: request, withResult: .invalidOffset)
            return
        }
        request.value = value.subdata(in: offset..<value.count)
        peripheral.respond(to: request, withResult: .success)

        // Long values arrive as several reads with growing offsets —
        // only the first one counts as "someone read us".
        guard offset == 0 else { return }

        let centralId = request.central.identifier
        if notifiedPayloads[centralId] == value {
            return
        }
        notifiedPayloads[centralId] = value
        module.sendEvent("onBleRead")
    }
}

// ═══════════════════════════════════════
// MARK: – Central Delegate
// ═══════════════════════════════════════

private class CentralDelegate: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    weak var module: BleShareModule?
    weak var centralManager: CBCentralManager?
    var onDiscovered: ((String, Double) -> Void)?

    // RSSI moving average buffer per device
    private var rssiBuffers: [UUID: [Int]] = [:]

    // Devices that may not be connected again until the given time
    private var cooldownUntil: [UUID: Date] = [:]

    // Phones over the threshold during the current selection window
    private var candidates: [UUID: (peripheral: CBPeripheral, rssi: Double)] = [:]
    private var selectionScheduled = false

    // Single in-flight connection (JS handles one prompt at a time anyway)
    private var activePeripheral: CBPeripheral?
    private var activeRSSI: Double = 0
    private var attemptToken = UUID()

    func disconnectAndReset() {
        if let peripheral = activePeripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
            peripheral.delegate = nil
        }
        activePeripheral = nil
        attemptToken = UUID()
        candidates.removeAll()
        selectionScheduled = false
        rssiBuffers.removeAll()
        cooldownUntil.removeAll()
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        module?.sendEvent("onBluetoothStateChanged", ["state": bluetoothStateString(central.state)])
        if central.state == .poweredOn {
            if module?.isScanningRequested == true, !central.isScanning {
                central.scanForPeripherals(
                    withServices: [kServiceUUID],
                    options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
                )
            }
        } else {
            activePeripheral?.delegate = nil
            activePeripheral = nil
            attemptToken = UUID()
            candidates.removeAll()
            selectionScheduled = false
            rssiBuffers.removeAll()
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let rssiValue = RSSI.intValue
        // 127 = RSSI unavailable
        guard rssiValue != 127, rssiValue < 0 else { return }
        guard let module = module, module.isScanningRequested else { return }

        let deviceId = peripheral.identifier
        if let until = cooldownUntil[deviceId], until > Date() { return }
        if activePeripheral?.identifier == deviceId { return }

        var buffer = rssiBuffers[deviceId] ?? []
        buffer.append(rssiValue)
        if buffer.count > kRSSIFilterWindow {
            buffer.removeFirst()
        }
        rssiBuffers[deviceId] = buffer
        guard buffer.count >= kMinRSSISamples else { return }

        let avgRSSI = Double(buffer.reduce(0, +)) / Double(buffer.count)
        guard avgRSSI >= module.rssiThreshold else { return }

        candidates[deviceId] = (peripheral, avgRSSI)
        if !selectionScheduled {
            selectionScheduled = true
            DispatchQueue.main.asyncAfter(deadline: .now() + kSelectionWindow) { [weak self] in
                self?.pickCandidate()
            }
        }
    }

    private func pickCandidate() {
        selectionScheduled = false
        guard let central = centralManager, central.state == .poweredOn,
              module?.isScanningRequested == true, activePeripheral == nil else {
            candidates.removeAll()
            return
        }
        guard let best = candidates.max(by: { $0.value.rssi < $1.value.rssi }) else { return }
        candidates.removeAll()

        let peripheral = best.value.peripheral
        let token = UUID()
        attemptToken = token
        activePeripheral = peripheral
        activeRSSI = best.value.rssi
        peripheral.delegate = self
        central.connect(peripheral, options: nil)

        // CoreBluetooth never times out a pending connect on its own.
        DispatchQueue.main.asyncAfter(deadline: .now() + kConnectTimeout) { [weak self] in
            guard let self = self, self.attemptToken == token, let active = self.activePeripheral else { return }
            self.finishConnection(active, cooldown: kFailureCooldown)
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didConnect peripheral: CBPeripheral
    ) {
        guard peripheral.identifier == activePeripheral?.identifier else {
            central.cancelPeripheralConnection(peripheral)
            return
        }
        peripheral.discoverServices([kServiceUUID])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        finishConnection(peripheral, cooldown: kFailureCooldown)
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        if peripheral.identifier == activePeripheral?.identifier {
            finishConnection(peripheral, cooldown: kFailureCooldown)
        }
    }

    // ── Peripheral Delegate (for the connected remote device) ──

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverServices error: Error?
    ) {
        guard error == nil,
              let service = peripheral.services?.first(where: { $0.uuid == kServiceUUID }) else {
            finishConnection(peripheral, cooldown: kFailureCooldown)
            return
        }
        peripheral.discoverCharacteristics([kCharacteristicUUID], for: service)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard error == nil,
              let char = service.characteristics?.first(where: { $0.uuid == kCharacteristicUUID }) else {
            finishConnection(peripheral, cooldown: kFailureCooldown)
            return
        }
        peripheral.readValue(for: char)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if error == nil,
           let data = characteristic.value,
           !data.isEmpty,
           let url = String(data: data, encoding: .utf8) {
            let rssi = activeRSSI
            finishConnection(peripheral, cooldown: kSuccessCooldown)
            onDiscovered?(url, rssi)
            return
        }
        finishConnection(peripheral, cooldown: kFailureCooldown)
    }

    private func finishConnection(_ peripheral: CBPeripheral, cooldown: TimeInterval) {
        centralManager?.cancelPeripheralConnection(peripheral)
        peripheral.delegate = nil
        cooldownUntil[peripheral.identifier] = Date().addingTimeInterval(cooldown)
        rssiBuffers.removeValue(forKey: peripheral.identifier)
        if peripheral.identifier == activePeripheral?.identifier {
            activePeripheral = nil
            attemptToken = UUID()
        }
    }
}
