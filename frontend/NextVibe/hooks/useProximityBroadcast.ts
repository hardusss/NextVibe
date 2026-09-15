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

type Options = {
    /** Another phone read this one's payload (either channel). */
    onRead?: () => void;
};

/**
 * Makes this phone discoverable with a payload URL on every channel it has:
 * Bluetooth on both platforms, plus an emulated NFC tag on Android (so
 * iPhones and Android phones can also read it with a tap).
 *
 * The native side is a singleton — only one surface should broadcast at a
 * time. Everything is stopped on unmount.
 */
export function useProximityBroadcast({ onRead }: Options = {}) {
    const [isActive, setIsActive] = useState(false);
    const [permission, setPermission] = useState<BluetoothPermissionStatus | null>(null);
    const [broadcastError, setBroadcastError] = useState<NativeProximityError | null>(null);
    const [lastReadAt, setLastReadAt] = useState<number | null>(null);

    const activeRef = useRef(false);
    const urlRef = useRef<string | null>(null);
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

    const pushToNative = useCallback((url: string) => {
        try {
            startBroadcasting(url);
        } catch (e) {
            walletLogger.error(WalletTag.PROXIMITY, 'startBroadcasting threw', e);
        }
        if (Platform.OS === 'android' && getNfcState() !== 'unsupported') {
            try {
                // Enabled even while NFC is switched off, so turning it on
                // in Settings makes the tag work without restarting.
                startSharing(url);
            } catch (e) {
                walletLogger.error(WalletTag.PROXIMITY, 'startSharing threw', e);
            }
        }
    }, []);

    /** Ask for permission if needed and start. Safe to call again. */
    const start = useCallback(async (url: string) => {
        urlRef.current = url;
        activeRef.current = true;
        const status = await ensureBluetoothPermissions({ prompt: true, forBroadcast: true });
        if (!activeRef.current || urlRef.current !== url) return;
        setPermission(status);
        setBroadcastError(null);
        // Even without Bluetooth permission Android can still share over NFC.
        pushToNative(urlRef.current);
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
        try {
            stopBroadcasting();
        } catch {}
        if (Platform.OS === 'android') {
            try {
                stopSharing();
            } catch {}
        }
        setIsActive(false);
        setLastReadAt(null);
    }, []);

    /** Re-run permission + start after the person fixed something in Settings. */
    const restart = useCallback(async () => {
        const url = urlRef.current;
        if (url) await start(url);
    }, [start]);

    useEffect(() => stop, [stop]);

    return { isActive, permission, broadcastError, lastReadAt, start, update, stop, restart };
}
