import ExpoModulesCore

// iOS does not let third-party apps emulate an NFC tag (HCE), so iPhones share
// over Bluetooth instead. The module keeps the same JS surface as Android so
// callers don't need platform branches; every call is a harmless no-op.
// (iPhones still *read* Android phones' tags through system background tag
// reading, which opens the universal link — no code needed here.)
public class NfcSendModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NfcSend")

    Events("onNfcRead", "onNfcStateChanged")

    Function("getNfcState") { () -> String in
      return "unsupported"
    }

    Function("startSharing") { (_: String) in
    }

    Function("stopSharing") {
    }
  }
}
