const mockDisk = new Map<string, string>();
let mockUserId: string | null = '7';

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockDisk.set(key, value); }),
    },
}));
jest.mock('@/src/utils/storage', () => ({
    storage: { getItem: jest.fn(async () => mockUserId) },
}));

import { useSeekerIntro, markSeekerIntroPending } from '../seekerIntroStore';

const state = () => useSeekerIntro.getState();

beforeEach(() => {
    mockDisk.clear();
    mockUserId = '7';
    useSeekerIntro.setState({ pendingFor: null });
});

describe('seekerIntroStore', () => {
    it('opens once for the signed-in account after the push', async () => {
        await markSeekerIntroPending();
        expect(state().pendingFor).toBe('7');
        expect(mockDisk.get('seeker_intro:7')).toBe('pending');

        await state().markShown();
        expect(state().pendingFor).toBeNull();
        expect(mockDisk.get('seeker_intro:7')).toBe('shown');
    });

    it('never reopens, even when the same push comes back on the next launch', async () => {
        await markSeekerIntroPending();
        await state().markShown();

        useSeekerIntro.setState({ pendingFor: null }); // fresh launch
        await markSeekerIntroPending();
        await state().restore('7');
        expect(state().pendingFor).toBeNull();
    });

    it('survives a restart before the profile was opened', async () => {
        await markSeekerIntroPending();
        useSeekerIntro.setState({ pendingFor: null }); // app killed before the sheet showed

        await state().restore('7');
        expect(state().pendingFor).toBe('7');
    });

    it('keeps each account separate', async () => {
        await markSeekerIntroPending();
        await state().markShown();

        mockUserId = '8';
        await markSeekerIntroPending();
        expect(state().pendingFor).toBe('8');
        await state().restore('7');
        expect(state().pendingFor).toBe('8');
    });

    it('does nothing while signed out', async () => {
        mockUserId = null;
        await markSeekerIntroPending();
        expect(state().pendingFor).toBeNull();
        expect(mockDisk.size).toBe(0);
    });
});
