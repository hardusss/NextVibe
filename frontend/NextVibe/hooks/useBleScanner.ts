import { useEffect, useRef } from "react";
import { AppState, Platform, Vibration } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { startScanning, stopScanning, addBleDiscoveredListener } from "@/modules/ble-share";

export function useBleScanner() {
    const router = useRouter();
    const lastScannedUrlRef = useRef<string | null>(null);
    const lastScannedTimeRef = useRef<number>(0);

    useEffect(() => {
        if (Platform.OS !== "ios") return;

        let isScanning = false;

        const startScanner = () => {
            if (!isScanning) {
                try {
                    startScanning();
                    isScanning = true;
                    if (__DEV__) console.log("[useBleScanner] BLE Background scanning started");
                } catch (e) {
                    console.warn("[useBleScanner] Failed to start BLE scanning:", e);
                }
            }
        };

        const stopScanner = () => {
            if (isScanning) {
                try {
                    stopScanning();
                    isScanning = false;
                    if (__DEV__) console.log("[useBleScanner] BLE Background scanning stopped");
                } catch (e) {
                    console.warn("[useBleScanner] Failed to stop BLE scanning:", e);
                }
            }
        };

        // Start scanning initially if app is active
        if (AppState.currentState === "active") {
            startScanner();
        }

        const appStateSub = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active") {
                startScanner();
            } else {
                stopScanner();
            }
        });

        const bleSub = addBleDiscoveredListener((event) => {
            if (!event.url) return;

            const now = Date.now();
            // Debounce matching URLs for 5 seconds to avoid double routing
            if (
                lastScannedUrlRef.current === event.url &&
                now - lastScannedTimeRef.current < 5000
            ) {
                return;
            }

            lastScannedUrlRef.current = event.url;
            lastScannedTimeRef.current = now;

            // Feedback: double vibration and Success haptic
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Vibration.vibrate([0, 80, 50, 80]);

            // Route extraction
            try {
                let path = event.url;
                if (path.startsWith("https://nextvibe.io")) {
                    path = path.substring("https://nextvibe.io".length);
                } else if (path.startsWith("nextvibe.io")) {
                    path = path.substring("nextvibe.io".length);
                }

                if (__DEV__) console.log("[useBleScanner] Navigating to path:", path);

                // Wait 150ms for haptics/vibe before switching screen
                setTimeout(() => {
                    router.push(path as any);
                }, 150);
            } catch (err) {
                console.error("[useBleScanner] Failed to route URL:", event.url, err);
            }
        });

        return () => {
            appStateSub.remove();
            bleSub.remove();
            stopScanner();
        };
    }, []);
}
