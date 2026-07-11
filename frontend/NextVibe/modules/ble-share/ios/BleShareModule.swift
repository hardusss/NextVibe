import ExpoModulesCore
import CoreBluetooth

// ── Constants ──
// Custom UUIDs for NextVibe BLE sharing
private let kServiceUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
private let kCharacteristicUUID = CBUUID(string: "A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

// RSSI threshold for proximity detection (~5-15cm)
private let kRSSIThreshold: Int = -45

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
            self.startCentral()
        }

        Function("stopScanning") {
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
        stopCentral()

        let delegate = CentralDelegate()
        delegate.onDiscovered = { [weak self] url in
            self?.sendEvent("onBleDiscovered", ["url": url])
        }

        self.centralDelegate = delegate
        self.centralManager = CBCentralManager(delegate: delegate, queue: .main)
    }

    private func stopCentral() {
        if let cm = centralManager, cm.state == .poweredOn {
            cm.stopScan()
        }
        centralManager = nil
        centralDelegate = nil
    }
}

// ═══════════════════════════════════════
// MARK: – Peripheral Delegate
// ═══════════════════════════════════════

private class PeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
    var onReady: (() -> Void)?
    var onRead: (() -> Void)?

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

                // Notify JS that someone read our profile
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
    var onDiscovered: ((String) -> Void)?

    // RSSI moving average buffer per device
    private var rssiBuffers: [UUID: [Int]] = [:]

    // Debounce: last time we fired a discovery event per device
    private var lastDiscoveryTime: [UUID: Date] = [:]

    // Keep strong references to peripherals we're connecting to
    private var connectingPeripherals: [UUID: CBPeripheral] = [:]

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            // Scan specifically for our service UUID
            central.scanForPeripherals(
                withServices: [kServiceUUID],
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
            )
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
        connectingPeripherals.removeValue(forKey: peripheral.identifier)
    }

    // ── Peripheral Delegate (for the connected remote device) ──

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverServices error: Error?
    ) {
        guard let services = peripheral.services else { return }
        for service in services where service.uuid == kServiceUUID {
            peripheral.discoverCharacteristics([kCharacteristicUUID], for: service)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard let chars = service.characteristics else { return }
        for char in chars where char.uuid == kCharacteristicUUID {
            peripheral.readValue(for: char)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let data = characteristic.value,
           let url = String(data: data, encoding: .utf8) {
            DispatchQueue.main.async { [weak self] in
                self?.onDiscovered?(url)
            }
        }

        // Disconnect after reading
        if let cm = peripheral.delegate as? CentralDelegate {
            // We need the central manager to disconnect — store reference differently
        }
        connectingPeripherals.removeValue(forKey: peripheral.identifier)
    }
}
