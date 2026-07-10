package expo.modules.bleshare

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BleShareModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BleShare")

        Events("onBleRead", "onBleDiscovered")

        // No-op on Android — NFC is used instead
        Function("startBroadcasting") { _: String -> }
        Function("stopBroadcasting") { }
        Function("startScanning") { }
        Function("stopScanning") { }
    }
}
