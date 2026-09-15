/**
 * Single owner of the BLE scan intent and of Bluetooth permissions.
 *
 * The native module is idempotent and self-healing (it resumes a requested
 * scan when Bluetooth powers on), so JS keeps only *intent* — never a
 * "currently scanning" truth flag, which historically desynced from native
 * when the adapter was off at start time. The global scanner hook, the tap
 * screens and the Settings toggle all go through this controller so the
 * intent stays consistent.
 */
import { Platform, PermissionsAndroid, type Permission } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getBluetoothAuthorization,
    setScanSensitivity,
    startScanning,
    stopScanning,
} from '@/modules/ble-share';
import { walletLogger, WalletTag } from './walletLogger';

export const SCAN_SETTING_KEY = 'bluetooth_scan_enabled';

/** granted — ready; denied — can still ask; blocked — only Settings can fix it. */
export type BluetoothPermissionStatus = 'granted' | 'denied' | 'blocked';

let wantScan = false;
// Bumped by every start/stop so a slow async start can't resurrect a scan
// that was stopped while it awaited storage or a permission dialog.
let generation = 0;
let activeScanUsers = 0;
let permissionRequest: Promise<BluetoothPermissionStatus> | null = null;

function androidPermissions(forBroadcast: boolean): Permission[] {
    const apiLevel = Number(Platform.Version);
    if (apiLevel >= 31) {
        // BLUETOOTH_SCAN is declared neverForLocation, so no location here.
        const perms: Permission[] = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ];
        if (forBroadcast) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
        return perms;
    }
    return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

/**
 * Current Bluetooth permission without prompting.
 */
export async function getBluetoothPermissionStatus(forBroadcast = false): Promise<BluetoothPermissionStatus | 'notDetermined'> {
    if (Platform.OS === 'ios') {
        const auth = getBluetoothAuthorization();
        if (auth === 'granted') return 'granted';
        if (auth === 'notDetermined') return 'notDetermined';
        return 'blocked';
    }
    if (Platform.OS !== 'android') return 'blocked';
    try {
        const perms = androidPermissions(forBroadcast);
        const granted = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)));
        return granted.every(Boolean) ? 'granted' : 'denied';
    } catch {
        return 'denied';
    }
}

/**
 * Makes sure Bluetooth may be used. With `prompt` the system dialog is shown
 * when it can still be (iOS shows it when the native manager is created, so
 * "notDetermined" counts as a go-ahead there).
 */
export async function ensureBluetoothPermissions({
    prompt,
    forBroadcast = false,
}: { prompt: boolean; forBroadcast?: boolean }): Promise<BluetoothPermissionStatus> {
    const current = await getBluetoothPermissionStatus(forBroadcast);
    if (current === 'granted') return 'granted';

    if (Platform.OS === 'ios') {
        if (current === 'notDetermined') return prompt ? 'granted' : 'denied';
        return 'blocked';
    }
    if (!prompt) return 'denied';

    // One dialog at a time: the dialog itself backgrounds the app, and the
    // AppState handler would otherwise stack a second request behind it.
    // A request already on screen may have asked for fewer permissions
    // (scan only), so re-check once it's answered.
    if (permissionRequest) {
        await permissionRequest;
        const after = await getBluetoothPermissionStatus(forBroadcast);
        if (after === 'granted') return 'granted';
    }
    if (!permissionRequest) {
        permissionRequest = (async () => {
            try {
                const perms = androidPermissions(forBroadcast);
                const results = await PermissionsAndroid.requestMultiple(perms);
                if (perms.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
                if (perms.some((p) => results[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
                return 'denied';
            } catch (err) {
                walletLogger.error(WalletTag.BLE, 'Android permission request failed', err);
                return 'denied';
            } finally {
                permissionRequest = null;
            }
        })();
    }
    return permissionRequest;
}

export async function isScanSettingEnabled(): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(SCAN_SETTING_KEY)) !== 'false';
    } catch {
        return true;
    }
}

/** True when the app wants the scanner running (setting on + start requested). */
export function isScanWanted(): boolean {
    return wantScan;
}

/**
 * Request the scanner to run. Reads the user setting, checks permissions and
 * calls the native start — which is safe to call repeatedly and remembers the
 * request across Bluetooth power cycles. Resolves true when scanning was
 * requested natively.
 */
export async function requestScanStart({ prompt = false }: { prompt?: boolean } = {}): Promise<boolean> {
    const myGeneration = ++generation;

    if (!(await isScanSettingEnabled())) {
        walletLogger.debug(WalletTag.BLE, 'Scan not started: disabled in settings');
        return false;
    }

    const permission = await ensureBluetoothPermissions({ prompt });
    if (myGeneration !== generation) return false;
    if (permission !== 'granted') {
        walletLogger.warn(WalletTag.BLE, 'Scan not started: Bluetooth permission', { permission });
        return false;
    }

    wantScan = true;
    try {
        startScanning();
        walletLogger.info(WalletTag.BLE, 'Scan requested');
        return true;
    } catch (e) {
        walletLogger.error(WalletTag.BLE, 'Native startScanning threw', e);
        return false;
    }
}

/** Stop the scanner and clear the intent. */
export function requestScanStop(): void {
    generation++;
    wantScan = false;
    try {
        stopScanning();
        walletLogger.info(WalletTag.BLE, 'Scan stopped');
    } catch (e) {
        walletLogger.error(WalletTag.BLE, 'Native stopScanning threw', e);
    }
}

/**
 * Tap screens call this while open: people are deliberately holding phones
 * together, so the proximity threshold loosens. Returns the release function.
 */
export function acquireActiveScanMode(): () => void {
    activeScanUsers++;
    if (activeScanUsers === 1) setScanSensitivity('active');
    let released = false;
    return () => {
        if (released) return;
        released = true;
        activeScanUsers = Math.max(0, activeScanUsers - 1);
        if (activeScanUsers === 0) setScanSensitivity('passive');
    };
}
