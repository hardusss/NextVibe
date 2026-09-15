import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { addNfcStateListener, getNfcState, type NfcState } from '@/modules/nfc-send';
import type { BroadcastChannels } from '@/hooks/useProximityBroadcast';

/**
 * How this phone hands out its tap code.
 * Android: NFC (default) or Bluetooth. iPhone: Bluetooth (default) or a QR
 * code — iPhones can't emulate an NFC tag.
 */
export type ShareChannel = 'nfc' | 'bluetooth' | 'qr';

const STORAGE_KEY = 'proximity_share_channel';

export const SHARE_CHANNEL_OPTIONS: ShareChannel[] = Platform.OS === 'android' ? ['nfc', 'bluetooth'] : ['bluetooth', 'qr'];
const DEFAULT_CHANNEL: ShareChannel = SHARE_CHANNEL_OPTIONS[0];

interface ShareChannelState {
    preference: ShareChannel;
    hydrated: boolean;
    setPreference: (channel: ShareChannel) => void;
    hydrate: () => Promise<void>;
}

const useShareChannelStore = create<ShareChannelState>((set, get) => ({
    preference: DEFAULT_CHANNEL,
    hydrated: false,
    setPreference: (channel) => {
        if (!SHARE_CHANNEL_OPTIONS.includes(channel)) return;
        set({ preference: channel });
        AsyncStorage.setItem(STORAGE_KEY, channel).catch(() => {});
    },
    hydrate: async () => {
        if (get().hydrated) return;
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored && SHARE_CHANNEL_OPTIONS.includes(stored as ShareChannel)) {
                set({ preference: stored as ShareChannel });
            }
        } catch {}
        set({ hydrated: true });
    },
}));

/** The radio channels a share channel needs (a QR code needs none). */
export function broadcastChannelsFor(channel: ShareChannel): BroadcastChannels {
    return channel === 'qr' ? 'none' : channel;
}

/**
 * The sharing channel for this phone, remembered across sessions. Android
 * phones without NFC fall back to Bluetooth (and get no choice).
 */
export function useShareChannel() {
    const preference = useShareChannelStore((s) => s.preference);
    const setPreference = useShareChannelStore((s) => s.setPreference);
    const hydrate = useShareChannelStore((s) => s.hydrate);
    const [nfcState, setNfcState] = useState<NfcState>(() =>
        Platform.OS === 'android' ? getNfcState() : 'unsupported'
    );

    useEffect(() => {
        hydrate();
        if (Platform.OS !== 'android') return;
        const sub = addNfcStateListener(({ state }) => setNfcState(state));
        return () => sub.remove();
    }, [hydrate]);

    const nfcAvailable = Platform.OS === 'android' && nfcState !== 'unsupported';
    const channel: ShareChannel = Platform.OS === 'android' && !nfcAvailable ? 'bluetooth' : preference;
    // Android without NFC has nothing to choose from.
    const canChoose = Platform.OS !== 'android' || nfcAvailable;

    return { channel, broadcastChannels: broadcastChannelsFor(channel), setPreference, canChoose };
}
