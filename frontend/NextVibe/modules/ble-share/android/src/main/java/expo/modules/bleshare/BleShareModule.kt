package expo.modules.bleshare

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class BleShareModule : Module() {

    private val kServiceUUID = UUID.fromString("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
    private val kCharacteristicUUID = UUID.fromString("A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

    private val kRSSIThreshold = -35
    private val kRSSIFilterWindow = 3
    private val kDiscoveryDebounceIntervalMs = 3000L

    private val rssiBuffers = ConcurrentHashMap<String, MutableList<Int>>()
    private val lastDiscoveryTime = ConcurrentHashMap<String, Long>()
    private val activeGatts = ConcurrentHashMap<String, BluetoothGatt>()
    private val readAddresses = ConcurrentHashMap.newKeySet<String>()

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var isScanning = false

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device ?: return
            val rssi = result.rssi

            // Ignore invalid RSSI values
            if (rssi == 127) return

            val address = device.address
            if (readAddresses.contains(address)) return

            // Update RSSI buffer
            val buffer = rssiBuffers.getOrPut(address) { mutableListOf() }
            buffer.add(rssi)
            if (buffer.size > kRSSIFilterWindow) {
                buffer.removeAt(0)
            }

            // Calculate average RSSI
            val avgRSSI = buffer.average().toInt()
            if (avgRSSI < kRSSIThreshold) return

            // Debounce discovery events
            val now = System.currentTimeMillis()
            val lastTime = lastDiscoveryTime[address] ?: 0L
            if (now - lastTime < kDiscoveryDebounceIntervalMs) {
                return
            }
            lastDiscoveryTime[address] = now

            // Connect to read URL if not already connecting/connected
            if (!activeGatts.containsKey(address)) {
                val context = appContext.reactContext ?: return
                try {
                    val gatt = device.connectGatt(context, false, gattCallback)
                    if (gatt != null) {
                        activeGatts[address] = gatt
                    }
                } catch (e: SecurityException) {
                }
            }
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val address = gatt.device.address
            try {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    gatt.close()
                    activeGatts.remove(address)
                }
            } catch (e: SecurityException) {
                gatt.close()
                activeGatts.remove(address)
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            try {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    val service = gatt.getService(kServiceUUID)
                    val characteristic = service?.getCharacteristic(kCharacteristicUUID)
                    if (characteristic != null) {
                        gatt.readCharacteristic(characteristic)
                    } else {
                        gatt.disconnect()
                    }
                } else {
                    gatt.disconnect()
                }
            } catch (e: SecurityException) {
                gatt.disconnect()
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            try {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    val value = characteristic.value
                    if (value != null) {
                        val url = String(value, Charsets.UTF_8)
                        readAddresses.add(gatt.device.address)
                        sendDiscoveredEvent(url)
                    }
                }
                gatt.disconnect()
            } catch (e: SecurityException) {
                gatt.disconnect()
            }
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            try {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    val url = String(value, Charsets.UTF_8)
                    readAddresses.add(gatt.device.address)
                    sendDiscoveredEvent(url)
                }
                gatt.disconnect()
            } catch (e: SecurityException) {
                gatt.disconnect()
            }
        }
    }

    private fun sendDiscoveredEvent(url: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                this@BleShareModule.sendEvent("onBleDiscovered", mapOf("url" to url))
            } catch (e: Exception) {
                // Ignore exception if the event emitter is not ready
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("BleShare")

        Events("onBleRead", "onBleDiscovered")

        // Broadcaster API - No-op on Android (NFC is used for broadcasting instead)
        Function("startBroadcasting") { _: String -> }
        Function("stopBroadcasting") { }

        // Scanner API
        Function("startScanning") {
            startScan()
        }

        Function("stopScanning") {
            stopScan()
        }
    }

    private fun startScan() {
        if (isScanning) return

        val context = appContext.reactContext ?: return
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter ?: return
        bluetoothAdapter = adapter

        if (!adapter.isEnabled) return

        val scanner = adapter.bluetoothLeScanner ?: return

        rssiBuffers.clear()
        lastDiscoveryTime.clear()
        readAddresses.clear()

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(kServiceUUID))
            .build()
        val filters = listOf(filter)

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        try {
            scanner.startScan(filters, settings, scanCallback)
            isScanning = true
        } catch (e: SecurityException) {
        }
    }

    private fun stopScan() {
        if (!isScanning) return

        val adapter = bluetoothAdapter
        val scanner = adapter?.bluetoothLeScanner
        if (scanner != null && adapter.isEnabled) {
            try {
                scanner.stopScan(scanCallback)
            } catch (e: SecurityException) {
            }
        }

        // Clean up connections
        for ((address, gatt) in activeGatts) {
            try {
                gatt.disconnect()
                gatt.close()
            } catch (e: Exception) {
            }
        }
        activeGatts.clear()
        rssiBuffers.clear()
        lastDiscoveryTime.clear()
        readAddresses.clear()
        isScanning = false
    }
}
