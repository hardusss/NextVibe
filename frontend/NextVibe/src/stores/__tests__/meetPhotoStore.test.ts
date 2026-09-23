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

import {
    closeMeetPhotoSheet,
    focusMeetPhoto,
    handleMeetPhotoSignal,
    isMeetPhotoEvent,
    isMeetPhotoSkipped,
    sheetOpensFor,
    skipMeetPhoto,
    useMeetPhotoStore,
} from '../meetPhotoStore';

const state = () => useMeetPhotoStore.getState();

beforeEach(() => {
    useMeetPhotoStore.setState({ sheetSlug: null, sheetSource: null, sheetOpenCount: 0, revisions: {}, focused: {}, presented: {} });
});

describe('meetPhotoStore', () => {
    it('news for this person opens the sheet; everything else only refreshes', () => {
        expect(['pending', 'minted', 'rejected', 'moderation_failed'].every(sheetOpensFor)).toBe(true);
        expect(['taking', 'released', 'approved', 'expired', 'taken_down'].some(sheetOpensFor)).toBe(false);

        handleMeetPhotoSignal('slugA', 'taking', 'socket');
        expect(state().sheetSlug).toBeNull();
        expect(state().revisions.slugA).toBe(1);

        handleMeetPhotoSignal('slugA', 'pending', 'push');
        expect(state().sheetSlug).toBe('slugA');
        expect(state().sheetSource).toBe('push');
        expect(state().presented.slugA).toBe(true);
        expect(state().revisions.slugA).toBe(2);
    });

    it("an open sheet for the same meet isn't presented again, it just refetches", () => {
        handleMeetPhotoSignal('slugA', 'pending', 'socket');
        const opened = state().sheetOpenCount;
        handleMeetPhotoSignal('slugA', 'minted', 'socket');
        expect(state().sheetOpenCount).toBe(opened);
        expect(state().revisions.slugA).toBe(2);
        closeMeetPhotoSheet();
        handleMeetPhotoSignal('slugA', 'minted', 'socket');
        expect(state().sheetOpenCount).toBe(opened + 1);
    });

    it('stays away from a screen that shows the meet itself', () => {
        const release = focusMeetPhoto('slugB');
        handleMeetPhotoSignal('slugB', 'rejected', 'socket');
        expect(state().sheetSlug).toBeNull();
        release();
        release(); // idempotent
        expect(state().focused.slugB).toBeUndefined();
        handleMeetPhotoSignal('slugB', 'rejected', 'socket');
        expect(state().sheetSlug).toBe('slugB');
    });

    it('recognises the socket envelope', () => {
        expect(isMeetPhotoEvent({ type: 'meet_photo', slug: 's', status: 'pending' })).toBe(true);
        expect(isMeetPhotoEvent({ type: 'message', slug: 's', status: 'pending' })).toBe(false);
        expect(isMeetPhotoEvent({ type: 'meet_photo', slug: 1 })).toBe(false);
        expect(isMeetPhotoEvent(null)).toBe(false);
    });

    it('remembers Skip per meet', async () => {
        expect(await isMeetPhotoSkipped('slugC')).toBe(false);
        await skipMeetPhoto('slugC');
        expect(await isMeetPhotoSkipped('slugC')).toBe(true);
        expect(await isMeetPhotoSkipped('slugD')).toBe(false);
    });
});
