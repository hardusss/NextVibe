package expo.modules.nfcsend

import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NfcSendModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NfcSend") 

    Events("onNfcRead")

    Function("startSharing") { url: String ->
      NdefHostApduService.urlToShare = url
      
      NdefHostApduService.onReadListener = {
          Handler(Looper.getMainLooper()).post {
              try {
                  this@NfcSendModule.sendEvent("onNfcRead")
              } catch (e: Exception) {
              }
          }
      }

      val context = appContext.reactContext
      if (context != null) {
          val pm = context.packageManager
          pm.setComponentEnabledSetting(
              ComponentName(context, NdefHostApduService::class.java),
              PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
              PackageManager.DONT_KILL_APP
          )
      }
    }

    Function("stopSharing") {
      NdefHostApduService.onReadListener = null 
      
      val context = appContext.reactContext
      if (context != null) {
          val pm = context.packageManager
          pm.setComponentEnabledSetting(
              ComponentName(context, NdefHostApduService::class.java),
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
              PackageManager.DONT_KILL_APP
          )
      }
    }
  }
}