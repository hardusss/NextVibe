import { useEffect, useRef } from "react";
import { AppState, Platform, Vibration, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { startScanning, stopScanning, addBleDiscoveredListener } from "@/modules/ble-share";

async function requestAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    try {
        const apiLevel = Number(Platform.Version);
        if (apiLevel >= 31) {
            const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            const scanGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
            const connectGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
            const locationGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

            if (__DEV__) {
                console.log("[useBleScanner] Android API >= 31 permissions status:", {
                    scanGranted,
                    connectGranted,
                    locationGranted
                });
            }

            return scanGranted && connectGranted && locationGranted;
        } else {
            const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            ]);

            const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
            const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

            if (__DEV__) {
                console.log("[useBleScanner] Android API < 31 permissions status:", {
                    fineGranted,
                    coarseGranted
                });
            }

            return fineGranted || coarseGranted;
        }
    } catch (err) {
        console.warn("[useBleScanner] Permission request error:", err);
        return false;
    }
}

export function useBleScanner() {
    const router = useRouter();
    const lastScannedUrlRef = useRef<string | null>(null);
    const lastScannedTimeRef = useRef<number>(0);

    useEffect(() => {
        if (Platform.OS !== "ios" && Platform.OS !== "android") return;

        let isScanning = false;

        const startScanner = async () => {
            if (!isScanning) {
                // Check user preference
                try {
                    const bluetoothSetting = await AsyncStorage.getItem("bluetooth_scan_enabled");
                    if (bluetoothSetting === "false") {
                        if (__DEV__) console.log("[useBleScanner] Background scanning disabled in settings");
                        return;
                    }
                } catch (e) {
                    console.warn("[useBleScanner] Failed to read settings:", e);
                }

                if (Platform.OS === "android") {
                    const hasPermission = await requestAndroidPermissions();
                    if (!hasPermission) {
                        if (__DEV__) console.log("[useBleScanner] Android permissions not granted, cannot scan.");
                        return;
                    }
                }
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
