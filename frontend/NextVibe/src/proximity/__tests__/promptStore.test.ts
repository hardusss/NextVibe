const mockPreview = jest.fn();
const mockVerify = jest.fn();

jest.mock('@/src/api/proximity.token', () => ({
    previewProximityToken: (...args: unknown[]) => mockPreview(...args),
    verifyProximityToken: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock('@/src/api/user.detail', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/src/utils/storage', () => ({ storage: { getItem: jest.fn(async () => 'access-token') } }));
jest.mock('@/src/utils/haptics', () => ({
    __esModule: true,
    default: { impact: jest.fn(), notification: jest.fn(), selection: jest.fn() },
}));
jest.mock('@/src/utils/walletLogger', () => ({
    walletLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    WalletTag: { PROXIMITY: 'p', BLE: 'b' },
}));
jest.mock('../location', () => ({
    getQuickLocation: jest.fn(async () => ({ status: 'ok', latitude: 1, longitude: 2 })),
}));

import { useProximityPrompt } from '../promptStore';

const link = (t: string) => `https://nextvibe.io/u/e?t=${t}`;
const alice = { user_id: 7, username: 'alice', avatar: null, is_official: false };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const axios400 = (data: object) => ({ response: { status: 400, data } });

let now = 1_000_000;
beforeEach(() => {
    now += 60 * 60_000; // each test starts well past every dedup window
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockPreview.mockReset();
    mockVerify.mockReset();
});
afterEach(() => {
    // Close on the mocked clock so dedup timestamps stay comparable.
    const s = useProximityPrompt.getState();
    if (s.visible) s.close();
    jest.restoreAllMocks();
});

const advance = (ms: number) => { now += ms; };
const state = () => useProximityPrompt.getState();

describe('promptStore', () => {
    it('asks to confirm a meet, then succeeds', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', source: 'irl', earned_points: 1, scanned_user: alice });
        mockVerify.mockResolvedValue({ success: true, interaction_type: 'irl', source: 'irl', earned_points: 1, scanned_user: alice });

        expect(state().handle(link('tokenAAA1'), 'ble')).toBe(true);
        await flush();
        expect(state().phase).toBe('confirm');
        expect(state().visible).toBe(true);
        expect(state().peer?.username).toBe('alice');

        await state().confirm();
        expect(state().phase).toBe('success');
        expect(state().lastMet?.userId).toBe(7);
    });

    it('drops a second tap while one is on screen', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', scanned_user: alice });
        state().handle(link('tokenBBB1'), 'ble');
        await flush();
        expect(state().handle(link('tokenBBB2'), 'ble')).toBe(false);
    });

    it('"Not now" silences the same person across rotated codes', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', scanned_user: alice });
        state().handle(link('tokenCCC1'), 'ble');
        await flush();
        state().close();

        advance(55_000); // next rotation, past the per-token decline window
        expect(state().handle(link('tokenCCC2'), 'ble')).toBe(true);
        await flush();
        expect(state().visible).toBe(false);

        advance(120_000); // past the per-person window it may ask again
        expect(state().handle(link('tokenCCC3'), 'ble')).toBe(true);
        await flush();
        expect(state().phase).toBe('confirm');
    });

    it('a failed tap from Bluetooth stays quiet for a while, but Try again works at once', async () => {
        mockPreview.mockRejectedValueOnce({ message: 'Network Error', request: {} });
        state().handle(link('tokenDDD1'), 'ble');
        await flush();
        expect(state().phase).toBe('error');
        expect(state().error?.kind).toBe('network');

        mockPreview.mockResolvedValueOnce({ preview: true, interaction_type: 'irl', scanned_user: alice });
        state().retry();
        await flush();
        expect(state().phase).toBe('confirm');
        state().close();

        mockPreview.mockRejectedValue({ message: 'Network Error', request: {} });
        state().handle(link('tokenDDD2'), 'ble');
        await flush();
        state().close();
        advance(5_000);
        expect(state().handle(link('tokenDDD2'), 'ble')).toBe(false);
        advance(11_000);
        expect(state().handle(link('tokenDDD2'), 'ble')).toBe(true);
    });

    it('treats a simultaneous confirm on the other phone as success', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'networking', earned_points: 4, scanned_user: alice });
        mockVerify.mockRejectedValue(axios400({ error: 'You have already connected with this user at this event.' }));
        state().handle(link('tokenEEE1'), 'ble');
        await flush();
        await state().confirm();
        expect(state().phase).toBe('success');
        expect(state().points).toBe(4);
    });

    it('stays silent for "already met" right after a meet', async () => {
        state().reportMet(99);
        mockPreview.mockRejectedValue(axios400({ error: 'You already tapped with bob today.', code: 'ALREADY_TAPPED_TODAY' }));
        state().handle(link('tokenFFF1'), 'ble');
        await flush();
        expect(state().visible).toBe(false);
    });

    it('closes a pending "Meet them?" when the other side confirmed first', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', scanned_user: alice });
        state().handle(link('tokenGGG1'), 'ble');
        await flush();
        expect(state().visible).toBe(true);
        state().reportMet(7);
        expect(state().visible).toBe(false);
    });

    it('opens the check-in screen once per event while the organizer code rotates', async () => {
        mockPreview.mockResolvedValue({ interaction_type: 'checkin', verified: true, post_id: 55, post_name: 'Meetup' });
        state().handle(link('tokenHHH1'), 'ble');
        await flush();
        expect(state().takeNavigation()?.params?._post_id).toBe('55');

        advance(55_000);
        state().handle(link('tokenHHH2'), 'ble');
        await flush();
        expect(state().takeNavigation()).toBeNull();
    });

    it('hands the success to an open Tap to Meet screen instead of stacking a sheet', async () => {
        state().setShareScreenActive(true);
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', scanned_user: { ...alice, user_id: 8 } });
        mockVerify.mockResolvedValue({ success: true, interaction_type: 'irl', scanned_user: { ...alice, user_id: 8 } });
        state().handle(link('tokenIII1'), 'ble');
        await flush();
        await state().confirm();
        expect(state().visible).toBe(false);
        expect(state().lastMet?.userId).toBe(8);
        state().setShareScreenActive(false);
    });

    it('recovers from a prompt that never moved', async () => {
        mockPreview.mockResolvedValue({ preview: true, interaction_type: 'irl', scanned_user: { ...alice, user_id: 9 } });
        state().handle(link('tokenJJJ1'), 'ble');
        await flush();
        advance(4 * 60_000);
        expect(state().handle(link('tokenJJJ2'), 'nfc')).toBe(true);
    });

    it('ignores links that are not ours', () => {
        expect(state().handle('https://example.com/u/e?t=abcd', 'link')).toBe(false);
        expect(state().handle('solana:abc?amount=1', 'ble')).toBe(false);
    });
});
