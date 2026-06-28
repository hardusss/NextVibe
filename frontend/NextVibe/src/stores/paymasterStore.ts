import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Kora Paymaster Usage Store
 *
 * Tracks how many sponsored (gasless) transactions the current wallet
 * has used today. The Kora backend enforces a hard limit of 10 tx/day
 * per wallet — this store mirrors that counter client-side so the UI
 * can show a progress indicator and disable gasless before hitting
 * a server-side rejection.
 *
 * Persistence: AsyncStorage with a date-keyed counter so counts
 * automatically reset when the calendar day rolls over.
 */

const MAX_TX_PER_DAY = 10;
const STORAGE_PREFIX = 'paymaster_tx_count_';

/** Get today's date key in YYYY-MM-DD format. */
function todayKey(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${STORAGE_PREFIX}${yyyy}-${mm}-${dd}`;
}

interface PaymasterState {
    /** Number of sponsored txs used today. */
    txCountToday: number;
    /** Server-enforced maximum. */
    maxTxPerDay: number;
    /** Derived: true when the user still has free interactions left. */
    isGaslessAvailable: boolean;
    /** True while loading the counter from storage. */
    isLoading: boolean;

    // ── Actions ──────────────────────────────────────────────────
    /** Load today's counter from AsyncStorage. Safe to call on every mount. */
    loadTodayCount: () => Promise<void>;
    /** Increment the counter after a successful sponsored tx. */
    incrementCount: () => Promise<void>;
    /** Reset counter if the stored date key is stale (new day). */
    resetIfNewDay: () => Promise<void>;
    /** Force-set the count (e.g. after querying the server). */
    setCount: (count: number) => void;
}

export const usePaymasterStore = create<PaymasterState>((set, get) => ({
    txCountToday: 0,
    maxTxPerDay: MAX_TX_PER_DAY,
    isGaslessAvailable: true,
    isLoading: true,

    loadTodayCount: async () => {
        try {
            const key = todayKey();
            const stored = await AsyncStorage.getItem(key);
            const count = stored ? parseInt(stored, 10) : 0;

            set({
                txCountToday: count,
                isGaslessAvailable: count < MAX_TX_PER_DAY,
                isLoading: false,
            });
        } catch (e) {
            console.warn('[paymasterStore] Failed to load count:', e);
            set({ isLoading: false });
        }
    },

    incrementCount: async () => {
        try {
            const next = get().txCountToday + 1;
            const key = todayKey();
            await AsyncStorage.setItem(key, String(next));

            set({
                txCountToday: next,
                isGaslessAvailable: next < MAX_TX_PER_DAY,
            });
        } catch (e) {
            console.warn('[paymasterStore] Failed to increment count:', e);
        }
    },

    resetIfNewDay: async () => {
        try {
            const key = todayKey();
            const stored = await AsyncStorage.getItem(key);

            if (stored === null) {
                // No entry for today → reset counter
                set({
                    txCountToday: 0,
                    isGaslessAvailable: true,
                    isLoading: false,
                });
            }
        } catch (e) {
            console.warn('[paymasterStore] Failed to reset:', e);
        }
    },

    setCount: (count: number) => {
        set({
            txCountToday: count,
            isGaslessAvailable: count < MAX_TX_PER_DAY,
        });
    },
}));
