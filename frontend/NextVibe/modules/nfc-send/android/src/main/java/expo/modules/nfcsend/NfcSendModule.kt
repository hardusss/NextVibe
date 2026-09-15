package expo.modules.nfcsend

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.nfc.cardemulation.CardEmulation
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NfcSendModule : Module() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var stateReceiver: BroadcastReceiver? = null
    private var preferredActivity: Activity? = null
    private var componentSynced = false

    private fun nfcState(): String {
        val context = appContext.reactContext ?: return "unknown"
        val pm = context.packageManager
        if (!pm.hasSystemFeature(PackageManager.FEATURE_NFC) ||
            !pm.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        ) {
            return "unsupported"
        }
        val adapter = NfcAdapter.getDefaultAdapter(context) ?: return "unsupported"
        return if (adapter.isEnabled) "enabled" else "disabled"
    }

    private fun setServiceEnabled(enabled: Boolean) {
        val context = appContext.reactContext ?: return
        try {
            context.packageManager.setComponentEnabledSetting(
                ComponentName(context, NdefHostApduService::class.java),
                if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
            componentSynced = true
        } catch (e: Exception) {
        }
    }

    /**
     * The enabled state persists across process deaths: if the app was killed
     * mid-share the tag would keep answering. Turn it off on first use.
     */
    private fun syncComponentOnce() {
        if (componentSynced) return
        if (!NdefHostApduService.isSharing) setServiceEnabled(false)
    }

    private fun registerStateReceiver() {
        if (stateReceiver != null) return
        val context = appContext.reactContext ?: return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                mainHandler.post {
                    try {
                        this@NfcSendModule.sendEvent("onNfcStateChanged", mapOf("state" to nfcState()))
                    } catch (e: Exception) {
                    }
                    if (NdefHostApduService.isSharing) applyForegroundPreferences()
                }
            }
        }
        try {
            val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(receiver, filter)
            }
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

    /**
     * While sharing, make our service win any AID conflict with other tag
     * emulator apps. Tied to the resumed activity; re-applied on foreground.
     * (This phone keeps reading tags too: a tap link read while sharing opens
     * the tap prompt over the share screen instead of navigating away.)
     */
    private fun applyForegroundPreferences() {
        mainHandler.post {
            val context = appContext.reactContext ?: return@post
            val activity = appContext.currentActivity ?: return@post
            val adapter = NfcAdapter.getDefaultAdapter(context) ?: return@post
            if (!adapter.isEnabled) return@post

            try {
                val cardEmulation = CardEmulation.getInstance(adapter)
                if (cardEmulation.setPreferredService(activity, ComponentName(context, NdefHostApduService::class.java))) {
                    preferredActivity = activity
                }
            } catch (e: Exception) {
            }
        }
    }

    private fun clearForegroundPreferences() {
        mainHandler.post {
            val context = appContext.reactContext ?: return@post
            val adapter = NfcAdapter.getDefaultAdapter(context) ?: return@post

            preferredActivity?.let { activity ->
                try {
                    CardEmulation.getInstance(adapter).unsetPreferredService(activity)
                } catch (e: Exception) {
                }
            }
            preferredActivity = null
        }
    }

    override fun definition() = ModuleDefinition {
        Name("NfcSend")

        Events("onNfcRead", "onNfcStateChanged")

        OnCreate {
            registerStateReceiver()
            syncComponentOnce()
        }

        OnDestroy {
            unregisterStateReceiver()
        }

        OnActivityEntersForeground {
            if (NdefHostApduService.isSharing) applyForegroundPreferences()
        }

        Function("getNfcState") {
            registerStateReceiver()
            syncComponentOnce()
            nfcState()
        }

        Function("startSharing") { url: String ->
            NdefHostApduService.urlToShare = url
            NdefHostApduService.onReadListener = {
                mainHandler.post {
                    try {
                        this@NfcSendModule.sendEvent("onNfcRead")
                    } catch (e: Exception) {
                    }
                }
            }
            val wasSharing = NdefHostApduService.isSharing
            NdefHostApduService.isSharing = true
            registerStateReceiver()
            // A new URL while already sharing is picked up on the next tap.
            if (!wasSharing) {
                setServiceEnabled(true)
                applyForegroundPreferences()
            }
        }

        Function("stopSharing") {
            NdefHostApduService.isSharing = false
            NdefHostApduService.onReadListener = null
            NdefHostApduService.urlToShare = ""
            setServiceEnabled(false)
            clearForegroundPreferences()
        }
    }
}
