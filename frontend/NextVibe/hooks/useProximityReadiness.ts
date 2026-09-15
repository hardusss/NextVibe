import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
    addBluetoothStateListener,
    getBluetoothState,
    isBroadcastSupported,
    type BluetoothState,
} from '@/modules/ble-share';
import { addNfcStateListener, getNfcState, type NfcState } from '@/modules/nfc-send';
import {
    ensureBluetoothPermissions,
    getBluetoothPermissionStatus,
    isScanSettingEnabled,
    requestScanStart,
    SCAN_SETTING_KEY,
} from '@/src/utils/bleScanController';

export type ReadinessRole = 'share' | 'receive' | 'both';

export type ReadinessIssueId =
    | 'bluetoothDenied'
    | 'bluetoothOff'
    | 'bluetoothUnsupported'
    | 'nfcOff'
    | 'scanPaused'
    | 'locationOff';

export interface ReadinessIssue {
    id: ReadinessIssueId;
    /** blocking = this phone can't tap at all; warning = one channel is missing. */
    severity: 'blocking' | 'warning';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void | Promise<void>;
}

type Snapshot = {
    permission: 'granted' | 'denied' | 'blocked' | 'notDetermined';
    bluetooth: BluetoothState;
    nfc: NfcState;
    broadcastSupported: boolean;
    scanEnabled: boolean;
    locationServices: boolean;
};

function openAndroidSettings(action: string) {
    Linking.sendIntent(action).catch(() => Linking.openSettings().catch(() => {}));
}

/**
 * Everything that silently stops a tap from working, as a short checklist
 * with a fix button for each item — Bluetooth off or denied, NFC off,
 * nearby detection paused in Settings, Location off on old Android.
 *
 * Re-checks whenever the app comes back to the foreground (people fix these
 * in Settings) and when the adapters change state.
 */
export function useProximityReadiness({
    role,
    enabled = true,
    channels = 'all',
    onFixed,
}: {
    role: ReadinessRole;
    enabled?: boolean;
    /** How this phone shares (NFC/Bluetooth/QR switch) — decides which problems block. */
    channels?: 'all' | 'nfc' | 'bluetooth' | 'none';
    /** Called after an in-app fix (permission granted, setting re-enabled) so the caller can restart. */
    onFixed?: () => void;
}) {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const onFixedRef = useRef(onFixed);
    onFixedRef.current = onFixed;

    const wantsBroadcast = role !== 'receive';
    const wantsScan = role !== 'share';
    const isAndroid = Platform.OS === 'android';
    // In NFC mode Android doesn't advertise, so the advertise permission doesn't matter.
    const broadcastNeedsBluetooth = wantsBroadcast && channels !== 'none' && (!isAndroid || channels !== 'nfc');

    const refresh = useCallback(async () => {
        const permission = await getBluetoothPermissionStatus(broadcastNeedsBluetooth);
        let bluetooth: BluetoothState = 'unknown';
        try {
            bluetooth = getBluetoothState();
        } catch {}
        const nfc = Platform.OS === 'android' ? getNfcState() : 'unsupported';
        const scanEnabled = await isScanSettingEnabled();
        let locationServices = true;
        if (Platform.OS === 'android' && Number(Platform.Version) < 31 && wantsScan) {
            try {
                locationServices = await Location.hasServicesEnabledAsync();
            } catch {}
        }
        setSnapshot({
            permission,
            bluetooth,
            nfc,
            broadcastSupported: isBroadcastSupported(),
            scanEnabled,
            locationServices,
        });
    }, [broadcastNeedsBluetooth, wantsScan]);

    useEffect(() => {
        if (!enabled) return;
        refresh();
        const appSub = AppState.addEventListener('change', (next) => {
            if (next === 'active') refresh();
        });
        const btSub = addBluetoothStateListener(() => refresh());
        const nfcSub = Platform.OS === 'android' ? addNfcStateListener(() => refresh()) : null;
        return () => {
            appSub.remove();
            btSub.remove();
            nfcSub?.remove();
        };
    }, [enabled, refresh]);

    const issues: ReadinessIssue[] = [];
    if (enabled && snapshot) {
        const nfcUsable = snapshot.nfc === 'enabled';
        const hasNfc = isAndroid && snapshot.nfc !== 'unsupported';
        // What this phone actually shares on right now.
        const sharesNfc = wantsBroadcast && hasNfc && (channels === 'all' || channels === 'nfc');
        const sharesBluetooth = wantsBroadcast && channels !== 'none' && (!isAndroid || channels !== 'nfc' || !hasNfc);
        // Bluetooth also receives: picking up the other person's phone.
        const needsBluetooth = sharesBluetooth || wantsScan;
        // A Bluetooth problem blocks only when nothing else can carry the tap.
        const bluetoothSeverity: ReadinessIssue['severity'] =
            sharesBluetooth && !(sharesNfc && nfcUsable) ? 'blocking'
                : role === 'receive' ? 'blocking'
                    : 'warning';
        const bluetoothWhy = sharesBluetooth
            ? 'NextVibe uses Bluetooth to find the phone right next to you.'
            : channels === 'none'
                ? 'Your QR code works without it — Bluetooth is only needed to pick up phones that share over Bluetooth.'
                : 'Your tap works over NFC — Bluetooth is only needed to pick up phones that share over Bluetooth, like iPhones.';

        if (needsBluetooth && snapshot.permission === 'blocked') {
            issues.push({
                id: 'bluetoothDenied',
                severity: bluetoothSeverity,
                title: 'Bluetooth access is off for NextVibe',
                message: `${bluetoothWhy} Allow it in Settings.`,
                actionLabel: 'Open Settings',
                onAction: () => Linking.openSettings().catch(() => {}),
            });
        } else if (needsBluetooth && snapshot.permission === 'denied' && isAndroid) {
            issues.push({
                id: 'bluetoothDenied',
                severity: bluetoothSeverity,
                title: 'Allow nearby devices',
                message: sharesBluetooth
                    ? 'NextVibe needs the "Nearby devices" permission to find the phone next to you.'
                    : bluetoothWhy,
                actionLabel: 'Allow',
                onAction: async () => {
                    const status = await ensureBluetoothPermissions({ prompt: true, forBroadcast: sharesBluetooth });
                    if (status === 'blocked') Linking.openSettings().catch(() => {});
                    await refresh();
                    if (status === 'granted') onFixedRef.current?.();
                },
            });
        } else if (needsBluetooth && snapshot.bluetooth === 'poweredOff') {
            issues.push({
                id: 'bluetoothOff',
                severity: bluetoothSeverity,
                title: 'Bluetooth is off',
                message: sharesBluetooth
                    ? (Platform.OS === 'ios'
                        ? 'Turn it on in Control Center — tapping starts again by itself.'
                        : 'Turn it on to tap with people nearby — tapping starts again by itself.')
                    : bluetoothWhy,
                ...(isAndroid && {
                    actionLabel: 'Turn on',
                    onAction: () => openAndroidSettings('android.settings.BLUETOOTH_SETTINGS'),
                }),
            });
        } else if (sharesBluetooth && (snapshot.bluetooth === 'unsupported' || !snapshot.broadcastSupported)) {
            issues.push({
                id: 'bluetoothUnsupported',
                severity: hasNfc ? 'warning' : 'blocking',
                title: "This phone can't broadcast over Bluetooth",
                message: hasNfc
                    ? 'Switch to NFC above and hold the backs of the phones together.'
                    : 'Ask the other person to open Tap to Meet on their phone instead — yours can still pick them up.',
            });
        }

        if (sharesNfc && snapshot.nfc === 'disabled') {
            issues.push({
                id: 'nfcOff',
                severity: sharesBluetooth ? 'warning' : 'blocking',
                title: 'NFC is off',
                message: sharesBluetooth
                    ? 'Turn it on so any phone can read you with a quick tap, even without the app open.'
                    : 'Turn on NFC to share with a tap, or switch to Bluetooth above.',
                actionLabel: 'Turn on',
                onAction: () => openAndroidSettings('android.settings.NFC_SETTINGS'),
            });
        }

        if (wantsScan && !snapshot.scanEnabled) {
            issues.push({
                id: 'scanPaused',
                severity: 'warning',
                title: 'Nearby detection is paused',
                message: "It's turned off in Settings, so this phone won't pick up other people's taps.",
                actionLabel: 'Turn on',
                onAction: async () => {
                    await AsyncStorage.setItem(SCAN_SETTING_KEY, 'true').catch(() => {});
                    await requestScanStart({ prompt: true });
                    await refresh();
                    onFixedRef.current?.();
                },
            });
        }

        if (wantsScan && !snapshot.locationServices) {
            issues.push({
                id: 'locationOff',
                severity: 'warning',
                title: 'Location is off',
                message: 'On this Android version, finding nearby phones needs Location switched on.',
                actionLabel: 'Open Settings',
                onAction: () => openAndroidSettings('android.settings.LOCATION_SOURCE_SETTINGS'),
            });
        }
    }

    return {
        issues,
        blocking: issues.some((i) => i.severity === 'blocking'),
        checked: snapshot !== null,
        refresh,
    };
}
