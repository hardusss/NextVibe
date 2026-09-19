import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '@/src/utils/storage';

/**
 * First-grant moment for Seeker Verified. When the `seeker_verified` push
 * lands (or the manual check in Settings succeeds), the badge sheet opens once
 * on the user's own profile, with a "New" pill and the share buttons.
 *
 * A per-account flag in AsyncStorage goes 'pending' → 'shown', so the sheet
 * never reopens on later launches, even when the OS hands the same push
 * response back on every cold start.
 */
type IntroFlag = 'pending' | 'shown';

const flagKey = (userId: string) => `seeker_intro:${userId}`;

async function readFlag(userId: string): Promise<IntroFlag | null> {
    try {
        return (await AsyncStorage.getItem(flagKey(userId))) as IntroFlag | null;
    } catch {
        return null;
    }
}

interface SeekerIntroState {
    /** Account whose intro is waiting for its own profile screen. */
    pendingFor: string | null;
    markPending: () => Promise<void>;
    /** Picks up an intro saved as pending before this launch. */
    restore: (userId: string) => Promise<void>;
    markShown: () => Promise<void>;
}

export const useSeekerIntro = create<SeekerIntroState>((set, get) => ({
    pendingFor: null,

    markPending: async () => {
        const userId = await storage.getItem('id');
        if (!userId || (await readFlag(userId)) === 'shown') return;
        await AsyncStorage.setItem(flagKey(userId), 'pending').catch(() => {});
        set({ pendingFor: userId });
    },

    restore: async (userId) => {
        if (get().pendingFor === userId) return;
        if ((await readFlag(userId)) === 'pending') set({ pendingFor: userId });
    },

    markShown: async () => {
        const userId = get().pendingFor;
        if (!userId) return;
        set({ pendingFor: null });
        await AsyncStorage.setItem(flagKey(userId), 'shown').catch(() => {});
    },
}));

export const markSeekerIntroPending = () => useSeekerIntro.getState().markPending();
