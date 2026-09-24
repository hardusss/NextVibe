/**
 * Collectibles in the app (backend posts/src/collectibles.py): the signed-in
 * person's summary (the banner, the tab header), live updates for cards on
 * screen, and "Putting 7 collectibles on Solana…" after a wallet connect.
 *
 * - Socket events ({type: "collectible", id, status, asset_id}) update any
 *   card showing that item in place (`updates`); the server's list wins on
 *   the next fetch.
 * - `landing`: a wallet save that queued items starts it with their count.
 *   The count of what's still on its way comes from the summary (polled
 *   while it lasts, and after every event), so a missed event can't leave
 *   it stuck. After LANDING_MAX_MS it ends with whatever landed; the rest
 *   retries on the server by itself.
 * - The banner's "Not now" is remembered per person for 7 days.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCollectiblesSummary, type CollectiblesSummary, type CollectibleStatus } from "@/src/api/collectibles";
import type { CollectibleUpdate } from "@/src/utils/collectibles";

export const LANDING_POLL_MS = 2500;
export const LANDING_MAX_MS = 90_000;
const BANNER_KEY = (userId: string) => `collectibles_banner_dismissed:${userId}`;

export interface CollectibleEvent {
    type: "collectible";
    id: number;
    kind?: string;
    status: CollectibleStatus;
    asset_id?: string | null;
    meet_slug?: string | null;
}

export interface Landing {
    total: number;
    landed: number;
    /** Still queued or retrying on the server when it ended */
    waiting: number;
    done: boolean;
    startedAt: number;
}

interface CollectiblesState {
    userId: string | null;
    summary: CollectiblesSummary | null;
    updates: Record<string, CollectibleUpdate>;
    /** Bumped on every event: lists refetch their counts */
    revision: number;
    landing: Landing | null;
    bannerDismissedAt: number | null;
    restore: (userId: string | null) => Promise<void>;
    setSummary: (summary: CollectiblesSummary) => void;
    refreshSummary: () => Promise<CollectiblesSummary | null>;
    applyEvent: (event: CollectibleEvent) => void;
    markPending: (id: number) => void;
    /** Fresh data from the server replaces what events said about these items. */
    dropUpdates: (ids: (number | string)[]) => void;
    startLanding: (total: number) => void;
    tickLanding: (summary: CollectiblesSummary, now: number) => void;
    clearLanding: () => void;
    dismissBanner: (now?: number) => void;
}

export const useCollectibles = create<CollectiblesState>((set, get) => ({
    userId: null,
    summary: null,
    updates: {},
    revision: 0,
    landing: null,
    bannerDismissedAt: null,

    restore: async (userId) => {
        if (get().userId === userId) return;
        set({ userId, summary: null, updates: {}, landing: null, bannerDismissedAt: null });
        if (!userId) return;
        try {
            const raw = await AsyncStorage.getItem(BANNER_KEY(userId));
            if (get().userId === userId) set({ bannerDismissedAt: raw ? Number(raw) || null : null });
        } catch {
            // no storage: the banner just shows
        }
    },

    setSummary: (summary) => set({ summary }),

    refreshSummary: async () => {
        try {
            const summary = await getCollectiblesSummary();
            set({ summary });
            const landing = get().landing;
            if (landing && !landing.done) get().tickLanding(summary, Date.now());
            return summary;
        } catch {
            return null;
        }
    },

    applyEvent: (event) => {
        if (!event || event.type !== "collectible" || event.id === undefined) return;
        set({
            updates: { ...get().updates, [String(event.id)]: { status: event.status, asset_id: event.asset_id ?? undefined } },
            revision: get().revision + 1,
        });
    },

    /** Claim pressed: the card says "Minting…" before the server answers. */
    markPending: (id) => set({ updates: { ...get().updates, [String(id)]: { status: "queued" } } }),

    dropUpdates: (ids) => {
        const updates = { ...get().updates };
        let changed = false;
        for (const id of ids) {
            if (String(id) in updates) {
                delete updates[String(id)];
                changed = true;
            }
        }
        if (changed) set({ updates });
    },

    startLanding: (total) => {
        if (total <= 0) return;
        set({ landing: { total, landed: 0, waiting: total, done: false, startedAt: Date.now() } });
    },

    tickLanding: (summary, now) => {
        const landing = get().landing;
        if (!landing || landing.done) return;
        const onTheirWay = Math.min(landing.total, summary.minting);
        const landed = Math.max(landing.landed, landing.total - onTheirWay);
        const timedOut = now - landing.startedAt >= LANDING_MAX_MS;
        const done = landed >= landing.total || timedOut;
        set({ landing: { ...landing, landed, waiting: landing.total - landed, done } });
    },

    clearLanding: () => set({ landing: null }),

    dismissBanner: (now = Date.now()) => {
        set({ bannerDismissedAt: now });
        const userId = get().userId;
        if (userId) AsyncStorage.setItem(BANNER_KEY(userId), String(now)).catch(() => { });
    },
}));

export function isCollectibleEvent(event: any): event is CollectibleEvent {
    return !!event && event.type === "collectible" && typeof event.id === "number" && typeof event.status === "string";
}

/** Socket events from the root layout's listener. */
export function handleCollectibleEvent(event: CollectibleEvent): void {
    const store = useCollectibles.getState();
    store.applyEvent(event);
    if (store.landing && !store.landing.done) store.refreshSummary();
}

/** A wallet save queued `total` items (src/api/save.wallet.ts): show them landing. */
export function startLanding(total: number): void {
    const store = useCollectibles.getState();
    store.startLanding(total);
    store.refreshSummary();
}
