/**
 * Single owner of the BLE scan intent.
 *
 * The native module is idempotent and self-healing (it resumes a requested
 * scan when Bluetooth powers on), so JS keeps only *intent* — never a
 * "currently scanning" truth flag, which historically desynced from native
 * when the adapter was off at start time. Both the global scanner hook and
 * the Settings toggle must go through this controller so the intent stays
 * consistent.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startScanning, stopScanning } from '@/modules/ble-share';
import { walletLogger, WalletTag } from './walletLogger';

let wantScan = false;
let androidPermissionGranted: boolean | null = null;

async function ensureAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
        const apiLevel = Number(Platform.Version);
        const needed = apiLevel >= 31
            ? [
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]
            : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

        // Skip the request dialog dance when everything is already granted.
        if (androidPermissionGranted === null || !androidPermissionGranted) {
            const alreadyGranted = await Promise.all(needed.map((p) => PermissionsAndroid.check(p)));
            if (alreadyGranted.every(Boolean)) {
                androidPermissionGranted = true;
                return true;
            }
            const results = await PermissionsAndroid.requestMultiple(needed);
            androidPermissionGranted = needed.every(
                (p) => results[p] === PermissionsAndroid.RESULTS.GRANTED
            );
        }
        return androidPermissionGranted;
    } catch (err) {
        walletLogger.error(WalletTag.BLE, 'Android permission request failed', err);
        return false;
    }
}

/** True when the app wants the scanner running (setting on + start requested). */
export function isScanWanted(): boolean {
    return wantScan;
}

/**
 * Request the scanner to run. Reads the user setting, checks permissions and
 * calls the native start — which is safe to call repeatedly and remembers the
 * request across Bluetooth power cycles.
 */
export async function requestScanStart(): Promise<void> {
    try {
        const bluetoothSetting = await AsyncStorage.getItem('bluetooth_scan_enabled');
        if (bluetoothSetting === 'false') {
            walletLogger.debug(WalletTag.BLE, 'Scan not started: disabled in settings');
            return;
        }
    } catch (e) {
        walletLogger.warn(WalletTag.BLE, 'Failed to read scan setting');
    }

    if (!(await ensureAndroidPermissions())) {
        walletLogger.warn(WalletTag.BLE, 'Scan not started: Android permissions missing');
        return;
    }

    wantScan = true;
    try {
        startScanning();
        walletLogger.info(WalletTag.BLE, 'Scan requested');
    } catch (e) {
        walletLogger.error(WalletTag.BLE, 'Native startScanning threw', e);
    }
}

/** Stop the scanner and clear the intent. */
export function requestScanStop(): void {
    wantScan = false;
    try {
        stopScanning();
        walletLogger.info(WalletTag.BLE, 'Scan stopped');
    } catch (e) {
        walletLogger.error(WalletTag.BLE, 'Native stopScanning threw', e);
    }
}
