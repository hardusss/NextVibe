package expo.modules.nfcsend

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NfcSendModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NfcSend")

    Function("startSharing") { url: String ->
      NdefHostApduService.urlToShare = url
      val context = appContext.reactContext ?: return@Function
      val pm = context.packageManager
      pm.setComponentEnabledSetting(
          ComponentName(context, NdefHostApduService::class.java),
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          PackageManager.DONT_KILL_APP
      )
    }

    Function("stopSharing") {
      val context = appContext.reactContext ?: return@Function
      val pm = context.packageManager
      pm.setComponentEnabledSetting(
          ComponentName(context, NdefHostApduService::class.java),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP
      )
    }
  }
}