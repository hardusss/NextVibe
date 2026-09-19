/**
 * Pending navigation intent: where a push tap or deep link wants the app to
 * go, held until the app is ready to go there (see ./appReadyStore.ts and
 * ./useIntentConsumer.ts). Entry points only ever write here; they never
 * call router.*.
 *
 * Persisted to AsyncStorage so an OTA reload or a crash between the tap and
 * the navigation cannot lose it. The last consumed id is persisted too, so the
 * same notification response handed back by the OS (a JS reload keeps the
 * native "last response") is not navigated to twice.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import { intentSignature, type PendingIntent } from './intents';

export const PENDING_INTENT_KEY = 'nav:pending_intent';
export const LAST_CONSUMED_KEY = 'nav:last_consumed_intent';
/** A persisted intent older than this is stale (the tap was long ago). */
export const INTENT_TTL_MS = 10 * 60 * 1000;
/** "Consumed a moment ago": redirect guards treat it like a pending one. */
export const RECENTLY_CONSUMED_MS = 5000;
/** One link delivered twice (+native-intent, Linking.getInitialURL, 'url' event) within this window is one intent. */
export const LINK_DEDUP_MS = 5000;

const TAG = WalletTag.NAV_INTENT;

interface PendingIntentState {
    intent: PendingIntent | null;
    hydrated: boolean;
    lastConsumedId: string | null;
    consumedAt: number;
    /** Last link seen (signature + time), for LINK_DEDUP_MS. */
    lastLink: { sig: string; at: number } | null;
    /** Reads the persisted intent; safe to call more than once. */
    hydrate: () => Promise<void>;
    /** Stores an intent; false when it was a duplicate of the pending or last consumed one. */
    set: (intent: PendingIntent) => boolean;
    /** Takes the intent out of the store and marks it consumed. */
    consume: () => PendingIntent | null;
    /** Drops a pending intent without navigating (logout). */
    clear: () => void;
}

const persist = async (intent: PendingIntent | null) => {
    try {
        if (intent) await AsyncStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
        else await AsyncStorage.removeItem(PENDING_INTENT_KEY);
    } catch (e) {
        walletLogger.warn(TAG, 'Could not persist pending intent', e);
    }
};

const persistConsumed = async (id: string) => {
    try {
        await AsyncStorage.setItem(LAST_CONSUMED_KEY, id);
    } catch (e) {
        walletLogger.warn(TAG, 'Could not persist consumed intent id', e);
    }
};

let hydrating: Promise<void> | null = null;

export const usePendingIntent = create<PendingIntentState>((set, get) => ({
    intent: null,
    hydrated: false,
    lastConsumedId: null,
    consumedAt: 0,
    lastLink: null,

    hydrate: () => {
        if (get().hydrated) return Promise.resolve();
        if (hydrating) return hydrating;
        hydrating = (async () => {
            let stored: PendingIntent | null = null;
            let lastConsumedId: string | null = null;
            try {
                const [raw, consumed] = await Promise.all([
                    AsyncStorage.getItem(PENDING_INTENT_KEY),
                    AsyncStorage.getItem(LAST_CONSUMED_KEY),
                ]);
                lastConsumedId = consumed;
                if (raw) {
                    const parsed = JSON.parse(raw) as PendingIntent;
                    if (parsed && typeof parsed.id === 'string' && typeof parsed.path === 'string') stored = parsed;
                }
            } catch (e) {
                walletLogger.warn(TAG, 'Could not read persisted intent', e);
            }

            const now = Date.now();
            const current = get().intent;
            let intent = current;
            if (!current && stored) {
                if (stored.id === lastConsumedId) {
                    walletLogger.info(TAG, 'Persisted intent already consumed; dropping', { id: stored.id });
                    persist(null);
                } else if (typeof stored.createdAt !== 'number' || now - stored.createdAt > INTENT_TTL_MS) {
                    walletLogger.info(TAG, 'Persisted intent expired; dropping', { id: stored.id, ageMs: now - (stored.createdAt || 0) });
                    persist(null);
                } else {
                    intent = stored;
                    walletLogger.info(TAG, 'Restored persisted intent', { id: stored.id, path: stored.path, params: stored.params });
                }
            } else if (current && stored && stored.id !== current.id) {
                // An entry point wrote a fresh intent before we finished reading; it wins.
                persist(current);
            }

            set({
                hydrated: true,
                intent,
                lastConsumedId: get().lastConsumedId ?? lastConsumedId,
            });
        })();
        return hydrating;
    },

    set: (intent) => {
        const { intent: current, lastConsumedId } = get();
        if (lastConsumedId === intent.id) {
            walletLogger.debug(TAG, 'Ignoring already-consumed intent', { id: intent.id });
            return false;
        }
        if (current?.id === intent.id) {
            walletLogger.debug(TAG, 'Ignoring duplicate pending intent', { id: intent.id });
            return false;
        }
        if (intent.source === 'link') {
            const sig = intentSignature(intent);
            const last = get().lastLink;
            set({ lastLink: { sig, at: intent.createdAt } });
            if (last && last.sig === sig && Math.abs(intent.createdAt - last.at) < LINK_DEDUP_MS) {
                walletLogger.debug(TAG, 'Ignoring second delivery of the same link', { sig });
                return false;
            }
        }
        walletLogger.info(TAG, 'Pending intent set', { id: intent.id, path: intent.path, params: intent.params, source: intent.source, kind: intent.kind });
        set({ intent });
        persist(intent);
        return true;
    },

    consume: () => {
        const intent = get().intent;
        if (!intent) return null;
        set({ intent: null, lastConsumedId: intent.id, consumedAt: Date.now() });
        persist(null);
        persistConsumed(intent.id);
        return intent;
    },

    clear: () => {
        if (!get().intent) return;
        walletLogger.info(TAG, 'Pending intent cleared');
        set({ intent: null });
        persist(null);
    },
}));

export const setPendingIntent = (intent: PendingIntent): boolean => usePendingIntent.getState().set(intent);
export const clearPendingIntent = (): void => usePendingIntent.getState().clear();
export const hydratePendingIntent = (): Promise<void> => usePendingIntent.getState().hydrate();

/** Sync check for redirect guards (Splash, sign-in success handlers). */
export function hasPendingIntent(): boolean {
    return usePendingIntent.getState().intent !== null;
}

/** True for a few seconds after the consumer navigated, so a late "go home" cannot undo it. */
export function recentlyConsumedIntent(withinMs: number = RECENTLY_CONSUMED_MS, now: number = Date.now()): boolean {
    const { consumedAt } = usePendingIntent.getState();
    return consumedAt > 0 && now - consumedAt < withinMs;
}

/** A pending or just-consumed intent means "do not send the user home". */
export function intentOwnsNavigation(): boolean {
    return hasPendingIntent() || recentlyConsumedIntent();
}

/** Resolves once the persisted intent has been read, or after `timeoutMs`. */
export function whenIntentHydrated(timeoutMs: number = 500): Promise<void> {
    const state = usePendingIntent.getState();
    if (state.hydrated) return Promise.resolve();
    const hydrate = state.hydrate();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([hydrate, timeout]);
}

/** Awaits the AsyncStorage write of the current intent (before Updates.reloadAsync). */
export async function flushPendingIntent(): Promise<void> {
    await persist(usePendingIntent.getState().intent);
}

/** Test helper: back to a fresh store. */
export function __resetPendingIntentForTests(): void {
    hydrating = null;
    usePendingIntent.setState({ intent: null, hydrated: false, lastConsumedId: null, consumedAt: 0, lastLink: null });
}
