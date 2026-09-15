import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { addNfcStateListener, getNfcState, type NfcState } from '@/modules/nfc-send';

/** How an Android phone hands out its tap code. iPhones always use Bluetooth. */
export type ShareChannel = 'nfc' | 'bluetooth';

const STORAGE_KEY = 'proximity_share_channel';

interface ShareChannelState {
    preference: ShareChannel;
    hydrated: boolean;
    setPreference: (channel: ShareChannel) => void;
    hydrate: () => Promise<void>;
}

// NFC is the default on Android: it only fires when phones actually touch,
// and the other phone doesn't even need NextVibe open.
const useShareChannelStore = create<ShareChannelState>((set, get) => ({
    preference: 'nfc',
    hydrated: false,
    setPreference: (channel) => {
        set({ preference: channel });
        AsyncStorage.setItem(STORAGE_KEY, channel).catch(() => {});
    },
    hydrate: async () => {
        if (get().hydrated) return;
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored === 'nfc' || stored === 'bluetooth') set({ preference: stored });
        } catch {}
        set({ hydrated: true });
    },
}));

/**
 * The sharing channel for this phone, remembered across sessions. Phones
 * without NFC fall back to Bluetooth (and get no choice).
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
    const channel: ShareChannel = nfcAvailable ? preference : 'bluetooth';

    return { channel, preference, setPreference, nfcAvailable };
}
