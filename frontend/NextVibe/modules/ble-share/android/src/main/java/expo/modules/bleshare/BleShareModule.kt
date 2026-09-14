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
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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

    // Pending-start: remembers that JS asked to scan so the state receiver
    // can start the scan the moment the adapter powers on.
    private var isScanRequested = false
    private var stateReceiver: BroadcastReceiver? = null

    private fun currentBluetoothState(): String {
        val context = appContext.reactContext ?: return "unknown"
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = manager?.adapter ?: return "unsupported"
        return if (adapter.isEnabled) "poweredOn" else "poweredOff"
    }

    private fun sendStateEvent(state: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                this@BleShareModule.sendEvent("onBluetoothStateChanged", mapOf("state" to state))
            } catch (e: Exception) {
                // Ignore exception if the event emitter is not ready
            }
        }
    }

    private fun registerStateReceiver() {
        if (stateReceiver != null) return
        val context = appContext.reactContext ?: return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                when (intent?.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)) {
                    BluetoothAdapter.STATE_ON -> {
                        sendStateEvent("poweredOn")
                        if (isScanRequested && !isScanning) {
                            startScan()
                        }
                    }
                    BluetoothAdapter.STATE_OFF, BluetoothAdapter.STATE_TURNING_OFF -> {
                        // The system already killed the scan; drop our bookkeeping
                        // but keep isScanRequested so power-on resumes it.
                        isScanning = false
                        for ((_, gatt) in activeGatts) {
                            try { gatt.close() } catch (e: Exception) { }
                        }
                        activeGatts.clear()
                        sendStateEvent("poweredOff")
                    }
                }
            }
        }
        try {
            context.registerReceiver(receiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED))
            stateReceiver = receiver
        } catch (e: Exception) {
        }
    }

    private fun unregisterStateReceiver() {
        val receiver = stateReceiver ?: return
        stateReceiver = null
        try {
            appContext.reactContext?.unregisterReceiver(receiver)
        } catch (e: Exception) {
        }
    }

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

        Events("onBleRead", "onBleDiscovered", "onBluetoothStateChanged")

        OnCreate {
            registerStateReceiver()
        }

        OnDestroy {
            unregisterStateReceiver()
        }

        Function("getBluetoothState") {
            currentBluetoothState()
        }

        // Broadcaster API - No-op on Android (NFC is used for broadcasting instead)
        Function("startBroadcasting") { _: String -> }
        Function("stopBroadcasting") { }

        // Scanner API
        Function("startScanning") {
            isScanRequested = true
            // OnCreate can run before the react context exists — retry here.
            registerStateReceiver()
            startScan()
        }

        Function("stopScanning") {
            isScanRequested = false
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
