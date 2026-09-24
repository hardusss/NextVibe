jest.mock('@react-native-async-storage/async-storage', () => {
    const data = new Map<string, string>();
    return {
        __esModule: true,
        default: {
            getItem: jest.fn(async (key: string) => data.get(key) ?? null),
            setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }),
        },
    };
});

const summaries: any[] = [];
jest.mock('@/src/api/collectibles', () => ({
    getCollectiblesSummary: jest.fn(async () => summaries.shift()),
}));

import { handleCollectibleEvent, isCollectibleEvent, LANDING_MAX_MS, startLanding, useCollectibles } from '../collectiblesStore';
import { useConnectWallet, openConnectWallet, closeConnectWallet } from '../connectWalletStore';

const state = () => useCollectibles.getState();
const summary = (minting: number, extra: Record<string, unknown> = {}) => ({
    offchain: 0, failed: 0, queued: minting, minting, minted: 0, claimable: 0, total: 7, has_wallet: true,
    wallet_reminders: true, ...extra,
});

beforeEach(() => {
    summaries.length = 0;
    useCollectibles.setState({ userId: null, summary: null, updates: {}, revision: 0, landing: null, bannerDismissedAt: null });
});

describe('collectiblesStore', () => {
    it('socket events update cards in place; fresh data drops them', () => {
        const event = { type: 'collectible', id: 5, status: 'minted', asset_id: 'Asset5', kind: 'meet' };
        expect(isCollectibleEvent(event)).toBe(true);
        expect(isCollectibleEvent({ type: 'meet_photo', slug: 'x' })).toBe(false);
        handleCollectibleEvent(event as any);
        expect(state().updates['5']).toEqual({ status: 'minted', asset_id: 'Asset5' });
        state().markPending(6);
        expect(state().updates['6']).toEqual({ status: 'queued' });
        state().dropUpdates([5, 6]);
        expect(state().updates).toEqual({});
    });

    it('a wallet connect that queued 7: the count follows what is still on its way', async () => {
        summaries.push(summary(7));
        startLanding(7);
        await Promise.resolve();
        expect(state().landing).toMatchObject({ total: 7, landed: 0, done: false });

        summaries.push(summary(4));
        await state().refreshSummary();
        expect(state().landing).toMatchObject({ landed: 3, waiting: 4, done: false });

        // A late summary can't take the count back down
        state().tickLanding(summary(6) as any, Date.now());
        expect(state().landing?.landed).toBe(3);

        summaries.push(summary(0));
        await state().refreshSummary();
        expect(state().landing).toMatchObject({ landed: 7, waiting: 0, done: true });
    });

    it('ends after a while with what landed; the rest retries on the server', () => {
        state().startLanding(5);
        const startedAt = state().landing!.startedAt;
        state().tickLanding(summary(2) as any, startedAt + LANDING_MAX_MS);
        expect(state().landing).toMatchObject({ landed: 3, waiting: 2, done: true });
    });

    it('the banner snooze is per person and survives a restart', async () => {
        await state().restore('41');
        expect(state().bannerDismissedAt).toBeNull();
        state().dismissBanner(1234);
        await Promise.resolve();
        useCollectibles.setState({ userId: null, bannerDismissedAt: null });
        await state().restore('41');
        expect(state().bannerDismissedAt).toBe(1234);
        await state().restore('42');
        expect(state().bannerDismissedAt).toBeNull();
    });
});

describe('connectWalletStore', () => {
    it('opens with a reason and the collect to go on with; closing forgets both', () => {
        const onConnected = jest.fn();
        openConnectWallet('collect', onConnected);
        expect(useConnectWallet.getState()).toMatchObject({ reason: 'collect', onConnected, openCount: 1 });
        openConnectWallet('banner');
        expect(useConnectWallet.getState()).toMatchObject({ reason: 'banner', onConnected: null, openCount: 2 });
        closeConnectWallet();
        expect(useConnectWallet.getState()).toMatchObject({ reason: null, onConnected: null });
    });
});
