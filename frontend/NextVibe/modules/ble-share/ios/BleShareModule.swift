import ExpoModulesCore
import CoreBluetooth

// ── Constants ──
// Custom UUIDs for NextVibe BLE sharing
private let kServiceUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
private let kCharacteristicUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

// RSSI threshold for proximity detection (~5-15cm)
private let kRSSIThreshold: Int = -35

// Moving average filter window size
private let kRSSIFilterWindow = 3

// Minimum interval between discovery events for the same device (seconds)
private let kDiscoveryDebounceInterval: TimeInterval = 3.0

public class BleShareModule: Module {

    // ── Peripheral (Broadcaster) state ──
    private var peripheralManager: CBPeripheralManager?
    private var peripheralDelegate: PeripheralDelegate?
    private var urlToShare: String = ""
    private var characteristic: CBMutableCharacteristic?

    // ── Central (Scanner) state ──
    private var centralManager: CBCentralManager?
    private var centralDelegate: CentralDelegate?
    fileprivate var isScanningRequested = false

    public func definition() -> ModuleDefinition {
        Name("BleShare")

        Events("onBleRead", "onBleDiscovered")

        // ── Broadcaster API ──

        Function("startBroadcasting") { (url: String) in
            self.urlToShare = url
            self.startPeripheral()
        }

        Function("stopBroadcasting") {
            self.stopPeripheral()
        }

        // ── Scanner API ──

        Function("startScanning") {
            self.isScanningRequested = true
            self.startCentral()
        }

        Function("stopScanning") {
            self.isScanningRequested = false
            self.stopCentral()
        }
    }

    // ═══════════════════════════════════════
    // MARK: – Peripheral (Broadcaster) Logic
    // ═══════════════════════════════════════

    private func startPeripheral() {
        stopPeripheral()

        let delegate = PeripheralDelegate()
        delegate.onReady = { [weak self] in
            self?.setupServiceAndAdvertise()
        }
        delegate.onRead = { [weak self] in
            self?.sendEvent("onBleRead")
        }

        self.peripheralDelegate = delegate
        self.peripheralManager = CBPeripheralManager(delegate: delegate, queue: .main)
    }

    private func setupServiceAndAdvertise() {
        guard let pm = peripheralManager else { return }

        // Create a readable characteristic containing the URL
        let urlData = urlToShare.data(using: .utf8) ?? Data()
        let char = CBMutableCharacteristic(
            type: kCharacteristicUUID,
            properties: [.read],
            value: urlData,
            permissions: [.readable]
        )
        self.characteristic = char

        let service = CBMutableService(type: kServiceUUID, primary: true)
        service.characteristics = [char]

        pm.add(service)

        // Start advertising
        pm.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [kServiceUUID],
            CBAdvertisementDataLocalNameKey: "NextVibe"
        ])
    }

    private func stopPeripheral() {
        peripheralDelegate?.resetBroadcastSession()
        peripheralManager?.stopAdvertising()
        peripheralManager?.removeAllServices()
        peripheralManager = nil
        peripheralDelegate = nil
        characteristic = nil
    }

    // ═══════════════════════════════════════
    // MARK: – Central (Scanner) Logic
    // ═══════════════════════════════════════

    private func startCentral() {
        if self.centralManager == nil {
            let delegate = CentralDelegate()
            delegate.module = self
            delegate.onDiscovered = { [weak self] url in
                self?.sendEvent("onBleDiscovered", ["url": url])
            }
            self.centralDelegate = delegate
            let manager = CBCentralManager(delegate: delegate, queue: .main)
            delegate.centralManager = manager
            self.centralManager = manager
        } else {
            centralDelegate?.centralManager = centralManager
            if let cm = centralManager, cm.state == .poweredOn {
                cm.scanForPeripherals(
                    withServices: [kServiceUUID],
                    options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
                )
            }
        }
    }

    private func stopCentral() {
        if let cm = centralManager, cm.state == .poweredOn {
            cm.stopScan()
        }
        centralDelegate?.disconnectAndReset()
    }
}

// ═══════════════════════════════════════
// MARK: – Peripheral Delegate
// ═══════════════════════════════════════

private class PeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
    var onReady: (() -> Void)?
    var onRead: (() -> Void)?

    // Last read time per central UUID during this broadcast session
    private var lastReadTimes: [UUID: Date] = [:]

    func resetBroadcastSession() {
        lastReadTimes.removeAll()
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            onReady?()
        }
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didReceiveRead request: CBATTRequest
    ) {
        // A nearby device is reading our characteristic
        if request.characteristic.uuid == kCharacteristicUUID {
            if let value = request.characteristic.value {
                let offset = request.offset
                if offset > value.count {
                    peripheral.respond(to: request, withResult: .invalidOffset)
                    return
                }
                request.value = value.subdata(in: offset..<value.count)
                peripheral.respond(to: request, withResult: .success)

                // Permit reads from the same central identifier if at least 3 seconds have passed since its last read
                let centralId = request.central.identifier
                let now = Date()
                if let lastReadTime = lastReadTimes[centralId], now.timeIntervalSince(lastReadTime) < 3.0 {
                    return
                }
                lastReadTimes[centralId] = now

                DispatchQueue.main.async { [weak self] in
                    self?.onRead?()
                }
            } else {
                peripheral.respond(to: request, withResult: .attributeNotFound)
            }
        }
    }
}

// ═══════════════════════════════════════
// MARK: – Central Delegate
// ═══════════════════════════════════════

private class CentralDelegate: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    weak var module: BleShareModule?
    weak var centralManager: CBCentralManager?
    var onDiscovered: ((String) -> Void)?

    // RSSI moving average buffer per device
    private var rssiBuffers: [UUID: [Int]] = [:]

    // Debounce: last time we fired a discovery event per device
    private var lastDiscoveryTime: [UUID: Date] = [:]

    // Devices already read during this scan session.
    private var readDeviceIds: Set<UUID> = []

    // Keep strong references to peripherals we're connecting to
    private var connectingPeripherals: [UUID: CBPeripheral] = [:]

    func resetScanSession() {
        rssiBuffers.removeAll()
        lastDiscoveryTime.removeAll()
        readDeviceIds.removeAll()
    }

    func disconnectAndReset() {
        let manager = centralManager
        for peripheral in connectingPeripherals.values {
            manager?.cancelPeripheralConnection(peripheral)
            peripheral.delegate = nil
        }
        connectingPeripherals.removeAll()
        resetScanSession()
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            if module?.isScanningRequested == true {
                // Scan specifically for our service UUID
                central.scanForPeripherals(
                    withServices: [kServiceUUID],
                    options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
                )
            }
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let rssiValue = RSSI.intValue

        // Ignore out-of-range or invalid RSSI
        guard rssiValue != 127 else { return }

        let deviceId = peripheral.identifier

        guard !readDeviceIds.contains(deviceId) else { return }
        guard connectingPeripherals[deviceId] == nil else { return }

        // Update RSSI moving average buffer
        var buffer = rssiBuffers[deviceId] ?? []
        buffer.append(rssiValue)
        if buffer.count > kRSSIFilterWindow {
            buffer.removeFirst()
        }
        rssiBuffers[deviceId] = buffer

        // Calculate moving average
        let avgRSSI = buffer.reduce(0, +) / buffer.count

        // Check proximity threshold
        guard avgRSSI >= kRSSIThreshold else { return }

        // Debounce check
        let now = Date()
        if let lastTime = lastDiscoveryTime[deviceId],
           now.timeIntervalSince(lastTime) < kDiscoveryDebounceInterval {
            return
        }
        lastDiscoveryTime[deviceId] = now

        // Device is close enough — connect to read the URL
        connectingPeripherals[deviceId] = peripheral
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    func centralManager(
        _ central: CBCentralManager,
        didConnect peripheral: CBPeripheral
    ) {
        // Discover our specific service
        peripheral.discoverServices([kServiceUUID])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        central.cancelPeripheralConnection(peripheral)
        peripheral.delegate = nil
        connectingPeripherals.removeValue(forKey: peripheral.identifier)
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        peripheral.delegate = nil
        connectingPeripherals.removeValue(forKey: peripheral.identifier)
    }

    // ── Peripheral Delegate (for the connected remote device) ──

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverServices error: Error?
    ) {
        if error != nil {
            finishConnection(peripheral)
            return
        }

        guard let services = peripheral.services else {
            finishConnection(peripheral)
            return
        }

        var foundService = false
        for service in services where service.uuid == kServiceUUID {
            foundService = true
            peripheral.discoverCharacteristics([kCharacteristicUUID], for: service)
        }
        if !foundService {
            finishConnection(peripheral)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if error != nil {
            finishConnection(peripheral)
            return
        }

        guard let chars = service.characteristics else {
            finishConnection(peripheral)
            return
        }

        var foundCharacteristic = false
        for char in chars where char.uuid == kCharacteristicUUID {
            foundCharacteristic = true
            peripheral.readValue(for: char)
        }
        if !foundCharacteristic {
            finishConnection(peripheral)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if error == nil,
           let data = characteristic.value,
           let url = String(data: data, encoding: .utf8) {
            readDeviceIds.insert(peripheral.identifier)
            DispatchQueue.main.async { [weak self] in
                self?.onDiscovered?(url)
            }
        }

        finishConnection(peripheral)
    }

    private func finishConnection(_ peripheral: CBPeripheral) {
        centralManager?.cancelPeripheralConnection(peripheral)
        peripheral.delegate = nil
        connectingPeripherals.removeValue(forKey: peripheral.identifier)
    }
}
