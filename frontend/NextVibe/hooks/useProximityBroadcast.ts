import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    addBleReadListener,
    addBroadcastErrorListener,
    startBroadcasting,
    stopBroadcasting,
    type NativeProximityError,
} from '@/modules/ble-share';
import { addNfcReadListener, getNfcState, startSharing, stopSharing } from '@/modules/nfc-send';
import { ensureBluetoothPermissions, type BluetoothPermissionStatus } from '@/src/utils/bleScanController';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

const READ_DEBOUNCE_MS = 2000;

/**
 * "all"       — Bluetooth plus the NFC tag on Android.
 * "nfc"       — NFC tag only (Android). Also for payloads only other apps
 *               understand, e.g. a Solana Pay URI a wallet reads.
 * "bluetooth" — Bluetooth only.
 * "none"      — no radio (the link is shown as a QR code instead).
 * iPhones can't emulate an NFC tag, so on iOS "all"/"nfc" mean Bluetooth.
 */
export type BroadcastChannels = 'all' | 'nfc' | 'bluetooth' | 'none';

type Options = {
    /** Another phone read this one's payload (either channel). */
    onRead?: () => void;
    /** Which channels to use; changing it while active switches on the fly. */
    channels?: BroadcastChannels;
};

function usesBluetooth(channels: BroadcastChannels): boolean {
    if (channels === 'none') return false;
    return Platform.OS !== 'android' || channels !== 'nfc';
}

function usesNfc(channels: BroadcastChannels): boolean {
    return Platform.OS === 'android' && (channels === 'all' || channels === 'nfc') && getNfcState() !== 'unsupported';
}

/**
 * Makes this phone discoverable with a payload URL on the chosen channels.
 * The native side is a singleton — only one surface should broadcast at a
 * time. Everything is stopped on unmount.
 */
export function useProximityBroadcast({ onRead, channels = 'all' }: Options = {}) {
    const [isActive, setIsActive] = useState(false);
    const [permission, setPermission] = useState<BluetoothPermissionStatus | null>(null);
    const [broadcastError, setBroadcastError] = useState<NativeProximityError | null>(null);
    const [lastReadAt, setLastReadAt] = useState<number | null>(null);

    const activeRef = useRef(false);
    const urlRef = useRef<string | null>(null);
    const channelsRef = useRef<BroadcastChannels>(channels);
    channelsRef.current = channels;
    // What is actually running natively, so switching only stops what's on.
    const nativeRef = useRef({ ble: false, nfc: false });
    const lastReadRef = useRef(0);
    const onReadRef = useRef(onRead);
    onReadRef.current = onRead;

    const handleRead = useCallback((source: 'BLE' | 'NFC') => {
        const now = Date.now();
        if (now - lastReadRef.current < READ_DEBOUNCE_MS) return;
        lastReadRef.current = now;
        walletLogger.info(WalletTag.PROXIMITY, 'Payload read by a nearby phone', { source });
        setLastReadAt(now);
        onReadRef.current?.();
    }, []);

    useEffect(() => {
        if (!isActive) return;
        const subs = [
            addBleReadListener(() => handleRead('BLE')),
            addBroadcastErrorListener((error) => {
                walletLogger.warn(WalletTag.PROXIMITY, 'Broadcast error', error);
                setBroadcastError(error);
            }),
        ];
        if (Platform.OS === 'android') subs.push(addNfcReadListener(() => handleRead('NFC')));
        return () => subs.forEach((s) => s.remove());
    }, [isActive, handleRead]);

    const stopNative = useCallback((which: { ble: boolean; nfc: boolean }) => {
        if (which.ble) {
            try {
                stopBroadcasting();
            } catch {}
            nativeRef.current.ble = false;
        }
        if (which.nfc && Platform.OS === 'android') {
            try {
                stopSharing();
            } catch {}
            nativeRef.current.nfc = false;
        }
    }, []);

    const pushToNative = useCallback((url: string) => {
        const current = channelsRef.current;
        const wantBle = usesBluetooth(current);
        const wantNfc = usesNfc(current);
        stopNative({ ble: !wantBle && nativeRef.current.ble, nfc: !wantNfc && nativeRef.current.nfc });

        if (wantBle) {
            try {
                startBroadcasting(url);
                nativeRef.current.ble = true;
            } catch (e) {
                walletLogger.error(WalletTag.PROXIMITY, 'startBroadcasting threw', e);
            }
        }
        if (wantNfc) {
            try {
                // Enabled even while NFC is switched off, so turning it on
                // in Settings makes the tag work without restarting.
                startSharing(url);
                nativeRef.current.nfc = true;
            } catch (e) {
                walletLogger.error(WalletTag.PROXIMITY, 'startSharing threw', e);
            }
        }
    }, [stopNative]);

    /** Ask for permission if needed and start. Safe to call again. */
    const start = useCallback(async (url: string) => {
        urlRef.current = url;
        activeRef.current = true;
        setBroadcastError(null);
        if (usesBluetooth(channelsRef.current)) {
            const status = await ensureBluetoothPermissions({ prompt: true, forBroadcast: true });
            if (!activeRef.current || urlRef.current !== url) return;
            setPermission(status);
        } else {
            setPermission(null);
        }
        pushToNative(url);
        setIsActive(true);
    }, [pushToNative]);

    /** Swap the payload (token rotation) without restarting anything. */
    const update = useCallback((url: string) => {
        urlRef.current = url;
        if (!activeRef.current) return;
        pushToNative(url);
    }, [pushToNative]);

    const stop = useCallback(() => {
        activeRef.current = false;
        urlRef.current = null;
        stopNative({ ble: true, nfc: true });
        setIsActive(false);
        setLastReadAt(null);
    }, [stopNative]);

    /** Re-run permission + start after the person fixed something in Settings. */
    const restart = useCallback(async () => {
        const url = urlRef.current;
        if (url) await start(url);
    }, [start]);

    // Switching channels while broadcasting.
    const previousChannels = useRef(channels);
    useEffect(() => {
        if (previousChannels.current === channels) return;
        previousChannels.current = channels;
        const url = urlRef.current;
        if (activeRef.current && url) start(url);
    }, [channels, start]);

    useEffect(() => stop, [stop]);

    return { isActive, permission, broadcastError, lastReadAt, start, update, stop, restart };
}
