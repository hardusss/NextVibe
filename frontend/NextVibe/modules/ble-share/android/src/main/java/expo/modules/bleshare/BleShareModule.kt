package expo.modules.bleshare

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE proximity sharing: a GATT server + advertisement that serves the current
 * payload (broadcaster), and a filtered scanner that connects to the closest
 * NextVibe phone and reads its payload (scanner).
 *
 * All mutable state is touched on the main looper; Bluetooth callbacks that
 * arrive on binder threads are posted there first.
 */
@SuppressLint("MissingPermission")
class BleShareModule : Module() {

    private val serviceUuid = UUID.fromString("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")
    private val characteristicUuid = UUID.fromString("A1B2C3D4-E5F6-7890-ABCD-EF1234567891")

    // Proximity threshold (average RSSI). A tap means phones touching; −50
    // already reached 20–30 cm. JS sets the value (setRssiThreshold) so it can
    // be tuned without a native release.
    private val defaultRssiThreshold = -45.0
    private val minRssiThreshold = -80.0
    private val maxRssiThreshold = -20.0
    private val rssiWindow = 3
    private val minRssiSamples = 2
    private val selectionWindowMs = 350L
    private val connectTimeoutMs = 6000L
    // A phone that stays next to this one isn't reconnected in a loop; a
    // failed read can be retried almost at once.
    private val successCooldownMs = 15_000L
    private val failureCooldownMs = 1500L

    // Android silently stops delivering results to apps that start scans more
    // than 5 times in 30s — stay under that.
    private val scanStartWindowMs = 30_000L
    private val maxScanStartsPerWindow = 4

    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Scanner state (main thread) ──
    private var rssiThreshold = defaultRssiThreshold
    private val rssiBuffers = HashMap<String, MutableList<Int>>()
    private val cooldownUntil = HashMap<String, Long>()
    private val candidates = HashMap<String, Pair<BluetoothDevice, Double>>()
    private var selectionScheduled = false
    private var activeGatt: BluetoothGatt? = null
    private var activeAddress: String? = null
    private var activeRssi = 0.0
    private var connectTimeout: Runnable? = null
    private val scanStartTimes = mutableListOf<Long>()
    private var pendingScanStart: Runnable? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var isScanning = false
    // Remembers that JS asked to scan so power-on resumes it.
    private var isScanRequested = false

    // ── Broadcaster state ──
    @Volatile private var broadcastPayload: ByteArray = ByteArray(0)
    @Volatile private var isBroadcastRequested = false
    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var serviceReady = false
    // Payload hash each central was last reported for — one onBleRead per
    // device per code, not per reconnect.
    private val notifiedPayloadByDevice = ConcurrentHashMap<String, Int>()

    private var stateReceiver: BroadcastReceiver? = null

    // ═══════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════

    private fun bluetoothManager(): BluetoothManager? {
        val context = appContext.reactContext ?: return null
        return context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }

    private fun hasPermission(name: String): Boolean {
        val context = appContext.reactContext ?: return false
        return context.checkSelfPermission(name) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasScanPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            hasPermission(Manifest.permission.BLUETOOTH_SCAN) &&
                hasPermission(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }

    private fun hasBroadcastPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE) &&
                hasPermission(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            true
        }
    }

    private fun currentBluetoothState(): String {
        val adapter = bluetoothManager()?.adapter ?: return "unsupported"
        if (!adapter.isEnabled) return "poweredOff"
        if (!hasScanPermissions()) return "unauthorized"
        return "poweredOn"
    }

    private fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
        mainHandler.post {
            try {
                this@BleShareModule.sendEvent(name, body)
            } catch (e: Exception) {
                // Event emitter not ready (module reloading) — nothing to do.
            }
        }
    }

    private fun registerStateReceiver() {
        if (stateReceiver != null) return
        val context = appContext.reactContext ?: return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val state = intent?.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                mainHandler.post { onAdapterStateChanged(state) }
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

    private fun onAdapterStateChanged(state: Int?) {
        when (state) {
            BluetoothAdapter.STATE_ON -> {
                emit("onBluetoothStateChanged", mapOf("state" to currentBluetoothState()))
                if (isScanRequested && !isScanning) startScan()
                if (isBroadcastRequested) startBroadcast()
            }
            BluetoothAdapter.STATE_OFF, BluetoothAdapter.STATE_TURNING_OFF -> {
                // The system already killed scans, connections and advertising;
                // drop our bookkeeping but keep the *requested* flags so
                // power-on resumes both.
                isScanning = false
                abandonActiveConnection()
                candidates.clear()
                rssiBuffers.clear()
                isAdvertising = false
                serviceReady = false
                try { gattServer?.close() } catch (e: Exception) { }
                gattServer = null
                emit("onBluetoothStateChanged", mapOf("state" to "poweredOff"))
            }
        }
    }

    // ═══════════════════════════════════════
    // Module definition
    // ═══════════════════════════════════════

    override fun definition() = ModuleDefinition {
        Name("BleShare")

        Events("onBleRead", "onBleDiscovered", "onBluetoothStateChanged", "onBroadcastError", "onScanError")

        OnCreate {
            registerStateReceiver()
        }

        OnDestroy {
            mainHandler.post {
                isScanRequested = false
                stopScan()
                stopBroadcast()
                unregisterStateReceiver()
            }
        }

        Function("getBluetoothState") {
            currentBluetoothState()
        }

        Function("getBluetoothAuthorization") {
            if (hasScanPermissions() && hasBroadcastPermissions()) "granted" else "denied"
        }

        Function("isBroadcastSupported") {
            val context = appContext.reactContext
            val adapter = bluetoothManager()?.adapter
            when {
                context == null || adapter == null -> false
                !context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) -> false
                // The advertiser is only exposed while the adapter is on.
                !adapter.isEnabled -> true
                else -> adapter.bluetoothLeAdvertiser != null
            }
        }

        Function("setRssiThreshold") { dbm: Double ->
            val clamped = dbm.coerceIn(minRssiThreshold, maxRssiThreshold)
            mainHandler.post {
                rssiThreshold = clamped
            }
        }

        // ── Broadcaster API ──

        Function("startBroadcasting") { url: String ->
            val bytes = url.toByteArray(Charsets.UTF_8)
            mainHandler.post {
                broadcastPayload = bytes
                isBroadcastRequested = true
                registerStateReceiver()
                startBroadcast()
            }
        }

        Function("stopBroadcasting") {
            mainHandler.post { stopBroadcast() }
        }

        // ── Scanner API ──

        Function("startScanning") {
            mainHandler.post {
                isScanRequested = true
                // OnCreate can run before the react context exists — retry here.
                registerStateReceiver()
                startScan()
            }
        }

        Function("stopScanning") {
            mainHandler.post {
                isScanRequested = false
                stopScan()
            }
        }
    }

    // ═══════════════════════════════════════
    // Broadcaster
    // ═══════════════════════════════════════

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            mainHandler.post { isAdvertising = true }
        }

        override fun onStartFailure(errorCode: Int) {
            mainHandler.post {
                if (errorCode == AdvertiseCallback.ADVERTISE_FAILED_ALREADY_STARTED) {
                    isAdvertising = true
                    return@post
                }
                isAdvertising = false
                val code = when (errorCode) {
                    AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "unsupported"
                    AdvertiseCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "too_many_advertisers"
                    AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE -> "data_too_large"
                    else -> "advertise_failed"
                }
                emit("onBroadcastError", mapOf("code" to code, "message" to "Advertising failed ($errorCode)"))
            }
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
            mainHandler.post {
                if (status == BluetoothGatt.GATT_SUCCESS && service?.uuid == serviceUuid) {
                    serviceReady = true
                    startAdvertising()
                } else if (service?.uuid == serviceUuid) {
                    emit("onBroadcastError", mapOf("code" to "service_add_failed", "message" to "GATT service add failed ($status)"))
                }
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            // Respond on this thread — the remote side is waiting on it.
            val server = gattServer ?: return
            val payload = broadcastPayload
            try {
                if (characteristic.uuid != characteristicUuid || !isBroadcastRequested || payload.isEmpty()) {
                    server.sendResponse(device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, null)
                    return
                }
                if (offset < 0 || offset > payload.size) {
                    server.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
                    return
                }
                server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, payload.copyOfRange(offset, payload.size))
            } catch (e: SecurityException) {
                return
            }

            // Long values arrive as several reads with growing offsets.
            if (offset != 0) return
            val address = device.address ?: return
            val payloadHash = payload.contentHashCode()
            if (notifiedPayloadByDevice.put(address, payloadHash) == payloadHash) return
            emit("onBleRead")
        }
    }

    private fun startBroadcast() {
        if (!isBroadcastRequested) return
        val context = appContext.reactContext ?: return
        val manager = bluetoothManager()
        val adapter = manager?.adapter
        if (manager == null || adapter == null) {
            emit("onBroadcastError", mapOf("code" to "unsupported", "message" to "Bluetooth is not available"))
            return
        }
        // Not an error: the state receiver resumes once Bluetooth is on.
        if (!adapter.isEnabled) return
        if (!hasBroadcastPermissions()) {
            emit("onBroadcastError", mapOf("code" to "unauthorized", "message" to "Bluetooth permission is missing"))
            return
        }
        val adv = adapter.bluetoothLeAdvertiser
        if (adv == null) {
            emit("onBroadcastError", mapOf("code" to "unsupported", "message" to "This phone can't broadcast over Bluetooth"))
            return
        }
        advertiser = adv

        if (gattServer == null) {
            val server = try {
                manager.openGattServer(context, gattServerCallback)
            } catch (e: SecurityException) {
                null
            }
            if (server == null) {
                emit("onBroadcastError", mapOf("code" to "gatt_failed", "message" to "Could not open the GATT server"))
                return
            }
            gattServer = server
            serviceReady = false
            val characteristic = BluetoothGattCharacteristic(
                characteristicUuid,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            val service = BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
            service.addCharacteristic(characteristic)
            val added = try {
                server.addService(service)
            } catch (e: SecurityException) {
                false
            }
            if (!added) {
                emit("onBroadcastError", mapOf("code" to "service_add_failed", "message" to "GATT service add failed"))
            }
            // Advertising starts from onServiceAdded.
            return
        }

        if (serviceReady) startAdvertising()
    }

    private fun startAdvertising() {
        if (isAdvertising || !isBroadcastRequested) return
        val adv = advertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        // 128-bit service UUID only: 3 (flags) + 18 bytes fits the 31-byte
        // legacy advertisement; the device name would overflow it.
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(serviceUuid))
            .build()
        try {
            adv.startAdvertising(settings, data, advertiseCallback)
            isAdvertising = true
        } catch (e: SecurityException) {
            emit("onBroadcastError", mapOf("code" to "unauthorized", "message" to "Bluetooth permission is missing"))
        } catch (e: Exception) {
            emit("onBroadcastError", mapOf("code" to "advertise_failed", "message" to (e.message ?: "Advertising failed")))
        }
    }

    private fun stopBroadcast() {
        isBroadcastRequested = false
        broadcastPayload = ByteArray(0)
        if (isAdvertising) {
            try {
                advertiser?.stopAdvertising(advertiseCallback)
            } catch (e: Exception) {
            }
        }
        isAdvertising = false
        try {
            gattServer?.clearServices()
            gattServer?.close()
        } catch (e: Exception) {
        }
        gattServer = null
        serviceReady = false
        notifiedPayloadByDevice.clear()
    }

    // ═══════════════════════════════════════
    // Scanner
    // ═══════════════════════════════════════

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            mainHandler.post { handleScanResult(result) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            mainHandler.post { results.forEach { handleScanResult(it) } }
        }

        override fun onScanFailed(errorCode: Int) {
            mainHandler.post {
                if (errorCode == ScanCallback.SCAN_FAILED_ALREADY_STARTED) {
                    isScanning = true
                    return@post
                }
                isScanning = false
                emit("onScanError", mapOf("code" to "scan_failed", "message" to "Scan failed ($errorCode)"))
                // Registration failures are usually transient — retry once later.
                if (isScanRequested) {
                    schedulePendingScanStart(5000L)
                }
            }
        }
    }

    private fun handleScanResult(result: ScanResult) {
        if (!isScanning) return
        val device = result.device ?: return
        val rssi = result.rssi
        // 127 = RSSI unavailable
        if (rssi >= 0 || rssi == 127) return

        val address = device.address ?: return
        val now = SystemClock.elapsedRealtime()
        val until = cooldownUntil[address]
        if (until != null && until > now) return
        if (activeAddress == address) return

        val buffer = rssiBuffers.getOrPut(address) { mutableListOf() }
        buffer.add(rssi)
        while (buffer.size > rssiWindow) buffer.removeAt(0)
        if (buffer.size < minRssiSamples) return

        val avg = buffer.average()
        if (avg < rssiThreshold) return

        candidates[address] = Pair(device, avg)
        if (!selectionScheduled) {
            selectionScheduled = true
            mainHandler.postDelayed({ pickCandidate() }, selectionWindowMs)
        }
    }

    private fun pickCandidate() {
        selectionScheduled = false
        if (!isScanning || activeGatt != null) {
            candidates.clear()
            return
        }
        val best = candidates.maxByOrNull { it.value.second } ?: return
        candidates.clear()
        connect(best.value.first, best.value.second)
    }

    private fun connect(device: BluetoothDevice, rssi: Double) {
        val context = appContext.reactContext ?: return
        val address = device.address ?: return
        activeAddress = address
        activeRssi = rssi
        val gatt = try {
            // TRANSPORT_LE: without it dual-mode phones may try BR/EDR and
            // fail with the infamous status 133.
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } catch (e: SecurityException) {
            null
        } catch (e: Exception) {
            null
        }
        if (gatt == null) {
            activeAddress = null
            cooldownUntil[address] = SystemClock.elapsedRealtime() + failureCooldownMs
            return
        }
        activeGatt = gatt
        val timeout = Runnable {
            if (activeGatt === gatt) finishAttempt(gatt, failureCooldownMs)
        }
        connectTimeout = timeout
        mainHandler.postDelayed(timeout, connectTimeoutMs)
    }

    /** Ends the in-flight connection and puts that phone on cooldown. */
    private fun finishAttempt(gatt: BluetoothGatt, cooldownMs: Long) {
        if (gatt !== activeGatt) {
            // Stale callback from an attempt that already finished.
            try { gatt.close() } catch (e: Exception) { }
            return
        }
        connectTimeout?.let { mainHandler.removeCallbacks(it) }
        connectTimeout = null
        val address = activeAddress
        activeGatt = null
        activeAddress = null
        try { gatt.disconnect() } catch (e: Exception) { }
        try { gatt.close() } catch (e: Exception) { }
        if (address != null) {
            cooldownUntil[address] = SystemClock.elapsedRealtime() + cooldownMs
            rssiBuffers.remove(address)
        }
    }

    private fun abandonActiveConnection() {
        val gatt = activeGatt ?: return
        finishAttempt(gatt, failureCooldownMs)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            mainHandler.post {
                if (gatt !== activeGatt) {
                    try { gatt.close() } catch (e: Exception) { }
                    return@post
                }
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    finishAttempt(gatt, failureCooldownMs)
                    return@post
                }
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        val started = try { gatt.discoverServices() } catch (e: SecurityException) { false }
                        if (!started) finishAttempt(gatt, failureCooldownMs)
                    }
                    BluetoothProfile.STATE_DISCONNECTED -> finishAttempt(gatt, failureCooldownMs)
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            mainHandler.post {
                if (gatt !== activeGatt) return@post
                val characteristic = if (status == BluetoothGatt.GATT_SUCCESS) {
                    gatt.getService(serviceUuid)?.getCharacteristic(characteristicUuid)
                } else {
                    null
                }
                if (characteristic == null) {
                    finishAttempt(gatt, failureCooldownMs)
                    return@post
                }
                val started = try { gatt.readCharacteristic(characteristic) } catch (e: SecurityException) { false }
                if (!started) finishAttempt(gatt, failureCooldownMs)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            // API < 33 path. Copy the value before leaving the binder thread.
            @Suppress("DEPRECATION")
            val value = characteristic.value?.copyOf()
            handleRead(gatt, value, status)
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            handleRead(gatt, value.copyOf(), status)
        }
    }

    private fun handleRead(gatt: BluetoothGatt, value: ByteArray?, status: Int) {
        mainHandler.post {
            if (gatt !== activeGatt) return@post
            if (status == BluetoothGatt.GATT_SUCCESS && value != null && value.isNotEmpty()) {
                val url = String(value, Charsets.UTF_8)
                val rssi = activeRssi
                finishAttempt(gatt, successCooldownMs)
                emit("onBleDiscovered", mapOf("url" to url, "rssi" to rssi))
            } else {
                finishAttempt(gatt, failureCooldownMs)
            }
        }
    }

    private fun schedulePendingScanStart(delayMs: Long) {
        pendingScanStart?.let { mainHandler.removeCallbacks(it) }
        val runnable = Runnable {
            pendingScanStart = null
            if (isScanRequested && !isScanning) startScan()
        }
        pendingScanStart = runnable
        mainHandler.postDelayed(runnable, delayMs)
    }

    private fun startScan() {
        if (isScanning) return
        pendingScanStart?.let { mainHandler.removeCallbacks(it) }
        pendingScanStart = null

        val now = SystemClock.elapsedRealtime()
        while (scanStartTimes.isNotEmpty() && now - scanStartTimes[0] > scanStartWindowMs) {
            scanStartTimes.removeAt(0)
        }
        if (scanStartTimes.size >= maxScanStartsPerWindow) {
            schedulePendingScanStart(scanStartWindowMs - (now - scanStartTimes[0]) + 250L)
            return
        }

        val adapter = bluetoothManager()?.adapter ?: return
        bluetoothAdapter = adapter
        // Not an error: the state receiver resumes once Bluetooth is on.
        if (!adapter.isEnabled) return
        if (!hasScanPermissions()) {
            emit("onScanError", mapOf("code" to "unauthorized", "message" to "Bluetooth permission is missing"))
            return
        }
        val scanner = adapter.bluetoothLeScanner ?: return

        val filters = listOf(
            ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(serviceUuid))
                .build()
        )
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        try {
            scanner.startScan(filters, settings, scanCallback)
            isScanning = true
            scanStartTimes.add(now)
        } catch (e: SecurityException) {
            emit("onScanError", mapOf("code" to "unauthorized", "message" to "Bluetooth permission is missing"))
        } catch (e: Exception) {
            emit("onScanError", mapOf("code" to "scan_failed", "message" to (e.message ?: "Scan failed")))
        }
    }

    private fun stopScan() {
        pendingScanStart?.let { mainHandler.removeCallbacks(it) }
        pendingScanStart = null

        if (isScanning) {
            val adapter = bluetoothAdapter
            val scanner = adapter?.bluetoothLeScanner
            if (scanner != null && adapter.isEnabled) {
                try {
                    scanner.stopScan(scanCallback)
                } catch (e: Exception) {
                }
            }
        }
        isScanning = false

        abandonActiveConnection()
        candidates.clear()
        selectionScheduled = false
        rssiBuffers.clear()
        cooldownUntil.clear()
    }
}
