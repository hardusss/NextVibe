import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    addBleDiscoveredListener,
    addBluetoothStateListener,
    addScanErrorListener,
} from "@/modules/ble-share";
import { requestScanStart, requestScanStop, isScanWanted } from "@/src/utils/bleScanController";
import { useProximityPrompt } from "@/src/proximity/promptStore";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

// The very first time a signed-in user opens the app we ask for Bluetooth
// once, so they can be tapped without visiting a tap screen first. After that
// the app-wide scanner never prompts again — tap screens ask with context.
const AUTO_PROMPT_KEY = "proximity_scan_prompted_v1";

/**
 * App-wide nearby scanner: while a signed-in user has NextVibe in the
 * foreground, phones held against this one are detected and handed to the
 * shared tap prompt (src/proximity/promptStore → ProximityPrompt).
 */
export function useBleScanner(enabled: boolean) {
    useEffect(() => {
        if (Platform.OS !== "ios" && Platform.OS !== "android") return;
        if (!enabled) {
            requestScanStop();
            return;
        }

        let cancelled = false;

        const start = async () => {
            let prompt = false;
            try {
                if (!(await AsyncStorage.getItem(AUTO_PROMPT_KEY))) {
                    await AsyncStorage.setItem(AUTO_PROMPT_KEY, "1");
                    prompt = true;
                }
            } catch {}
            if (cancelled || AppState.currentState !== "active") return;
            await requestScanStart({ prompt });
        };

        if (AppState.currentState === "active") {
            start();
        }

        const appStateSub = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active") {
                start();
            } else if (nextAppState === "background") {
                // Not on "inactive": iOS reports that for Control Center,
                // notification pulls and system alerts, where stopping would
                // just churn the radio.
                requestScanStop();
            }
        });

        // When Bluetooth is turned on while the app stays foregrounded,
        // re-issue the start (native also self-resumes; this covers
        // permission re-checks).
        const stateSub = addBluetoothStateListener(({ state }) => {
            walletLogger.info(WalletTag.BLE, "Bluetooth state changed", { state });
            if (state === "poweredOn" && isScanWanted() && AppState.currentState === "active") {
                requestScanStart();
            }
        });

        const errorSub = addScanErrorListener((error) => {
            walletLogger.warn(WalletTag.BLE, "Scan error", error);
        });

        const discoverSub = addBleDiscoveredListener((event) => {
            if (!event.url) return;
            const accepted = useProximityPrompt.getState().handle(event.url, "ble");
            if (accepted) {
                walletLogger.info(WalletTag.BLE, "Nearby payload accepted", { rssi: event.rssi });
            }
        });

        return () => {
            cancelled = true;
            appStateSub.remove();
            stateSub.remove();
            errorSub.remove();
            discoverSub.remove();
            requestScanStop();
        };
    }, [enabled]);
}
