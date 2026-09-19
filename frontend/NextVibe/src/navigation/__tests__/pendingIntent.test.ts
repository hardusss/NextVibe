const mockDisk = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockDisk.set(key, value); }),
        removeItem: jest.fn(async (key: string) => { mockDisk.delete(key); }),
    },
}));
jest.mock('@/src/utils/walletLogger', () => ({
    walletLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    WalletTag: { NAV_INTENT: 'Nav:Intent' },
}));

import {
    usePendingIntent, setPendingIntent, clearPendingIntent, hasPendingIntent, recentlyConsumedIntent,
    intentOwnsNavigation, whenIntentHydrated, __resetPendingIntentForTests,
    PENDING_INTENT_KEY, LAST_CONSUMED_KEY, INTENT_TTL_MS,
} from '../pendingIntent';
import { computeAppReady, msUntilProfileCap, PROFILE_WAIT_MS } from '../appReadyStore';
import type { PendingIntent } from '../intents';

const flush = () => new Promise((r) => setImmediate(r));
const state = () => usePendingIntent.getState();

const seeker = (id = 'push:n1', createdAt = Date.now()): PendingIntent => ({
    id, path: '/(tabs)/profile', params: { open: 'seeker' }, source: 'push', kind: 'seeker_verified', createdAt,
});

beforeEach(() => {
    mockDisk.clear();
    __resetPendingIntentForTests();
});

describe('pendingIntent store', () => {
    it('set → persist → consume → cleared and remembered', async () => {
        expect(setPendingIntent(seeker())).toBe(true);
        expect(hasPendingIntent()).toBe(true);
        await flush();
        expect(JSON.parse(mockDisk.get(PENDING_INTENT_KEY)!)).toMatchObject({ id: 'push:n1' });

        const taken = state().consume();
        expect(taken?.id).toBe('push:n1');
        expect(hasPendingIntent()).toBe(false);
        expect(recentlyConsumedIntent()).toBe(true);
        expect(intentOwnsNavigation()).toBe(true);
        await flush();
        expect(mockDisk.has(PENDING_INTENT_KEY)).toBe(false);
        expect(mockDisk.get(LAST_CONSUMED_KEY)).toBe('push:n1');
    });

    it('drops the same notification handed back again (cold start double delivery, JS reload)', async () => {
        setPendingIntent(seeker());
        expect(setPendingIntent(seeker())).toBe(false);
        state().consume();
        expect(setPendingIntent(seeker())).toBe(false);
        expect(hasPendingIntent()).toBe(false);
        // a different push is fine
        expect(setPendingIntent(seeker('push:n2'))).toBe(true);
    });

    it('survives a restart (OTA reload) and expires after the TTL', async () => {
        mockDisk.set(PENDING_INTENT_KEY, JSON.stringify(seeker('push:old', Date.now() - 1000)));
        await state().hydrate();
        expect(state().hydrated).toBe(true);
        expect(state().intent?.id).toBe('push:old');

        __resetPendingIntentForTests();
        mockDisk.set(PENDING_INTENT_KEY, JSON.stringify(seeker('push:stale', Date.now() - INTENT_TTL_MS - 1)));
        await state().hydrate();
        expect(state().intent).toBeNull();
        await flush();
        expect(mockDisk.has(PENDING_INTENT_KEY)).toBe(false);
    });

    it('does not restore an intent that was consumed before the restart', async () => {
        mockDisk.set(PENDING_INTENT_KEY, JSON.stringify(seeker('push:done')));
        mockDisk.set(LAST_CONSUMED_KEY, 'push:done');
        await state().hydrate();
        expect(state().intent).toBeNull();
        expect(state().lastConsumedId).toBe('push:done');
        expect(setPendingIntent(seeker('push:done'))).toBe(false);
    });

    it('an intent written before hydration finished wins over the persisted one', async () => {
        mockDisk.set(PENDING_INTENT_KEY, JSON.stringify(seeker('push:old')));
        const hydrating = state().hydrate();
        setPendingIntent(seeker('link:new'));
        await hydrating;
        expect(state().intent?.id).toBe('link:new');
        await flush();
        expect(JSON.parse(mockDisk.get(PENDING_INTENT_KEY)!).id).toBe('link:new');
    });

    it('whenIntentHydrated resolves after hydrate or the cap, and clear() forgets', async () => {
        await whenIntentHydrated(50);
        expect(state().hydrated).toBe(true);
        setPendingIntent(seeker());
        clearPendingIntent();
        expect(hasPendingIntent()).toBe(false);
        await flush();
        expect(mockDisk.has(PENDING_INTENT_KEY)).toBe(false);
    });

    it('one link delivered twice is one intent; the same link later is a new one', () => {
        const link = (at: number): PendingIntent => ({
            id: `link:x@${at}`, path: '/(tabs)/profile', params: { open: 'seeker' }, source: 'link', kind: 'seeker_verified', createdAt: at,
        });
        expect(setPendingIntent(link(1000))).toBe(true);
        expect(setPendingIntent(link(1500))).toBe(false);
        state().consume();
        expect(setPendingIntent(link(1000 + 60_000))).toBe(true);
    });

    it('recentlyConsumed is bounded', () => {
        setPendingIntent(seeker());
        state().consume();
        const at = state().consumedAt;
        expect(recentlyConsumedIntent(5000, at + 4999)).toBe(true);
        expect(recentlyConsumedIntent(5000, at + 5001)).toBe(false);
    });
});

describe('computeAppReady', () => {
    const base = { routerMounted: true, bootstrapDone: true, otaSettled: true, authStatus: 'in' as const, authSince: 1000, profileLoaded: true };

    it('needs every signal', () => {
        expect(computeAppReady(base, true, 2000)).toBe(true);
        expect(computeAppReady({ ...base, routerMounted: false }, true, 2000)).toBe(false);
        expect(computeAppReady({ ...base, bootstrapDone: false }, true, 2000)).toBe(false);
        expect(computeAppReady({ ...base, otaSettled: false }, true, 2000)).toBe(false);
        expect(computeAppReady({ ...base, authStatus: 'out' }, true, 2000)).toBe(false);
        expect(computeAppReady({ ...base, authStatus: 'unknown' }, true, 2000)).toBe(false);
        expect(computeAppReady(base, false, 2000)).toBe(false);
    });

    it('waits for the profile only up to the cap', () => {
        const s = { ...base, profileLoaded: false };
        expect(computeAppReady(s, true, 1000 + PROFILE_WAIT_MS - 1)).toBe(false);
        expect(computeAppReady(s, true, 1000 + PROFILE_WAIT_MS)).toBe(true);
        expect(msUntilProfileCap(s, 2000)).toBe(PROFILE_WAIT_MS - 1000);
        expect(msUntilProfileCap(base, 2000)).toBeNull();
        expect(msUntilProfileCap({ ...s, authStatus: 'out' }, 2000)).toBeNull();
    });
});
