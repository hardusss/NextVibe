/**
 * Proof of Meet photos in the app (the selfie two people take at a tap).
 *
 * - The photo sheet (components/Meet/MeetPhotoSheet.tsx, mounted once in the
 *   root layout) shows one meet's photo in whatever state it's in: the
 *   consent request, waiting, minting, "ready", or "passed on this one".
 *   Socket events, pushes, the start-up inbox check and the tap screens open it.
 * - `revisions`: every socket or push event about a meet bumps its counter;
 *   screens showing that meet refetch GET /meet/<slug>/photo. Events are only
 *   hints: the server's state is the truth.
 * - A screen that shows a meet's photo itself (the selfie screen) marks it
 *   focused, and the sheet stays out of its way.
 * - "Skip" on the tap screen is remembered per meet and never asks again.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MeetPhotoSheetSource = 'socket' | 'push' | 'inbox' | 'tap' | 'settings';

interface MeetPhotoStoreState {
    sheetSlug: string | null;
    sheetSource: MeetPhotoSheetSource | null;
    /** Bumped on every open, so opening the same meet again presents it again. */
    sheetOpenCount: number;
    revisions: Record<string, number>;
    focused: Record<string, number>;
    /** Consent requests already shown this session: the inbox check doesn't reopen them. */
    presented: Record<string, true>;
    openSheet: (slug: string, source: MeetPhotoSheetSource) => void;
    closeSheet: () => void;
    bump: (slug: string) => void;
}

export const useMeetPhotoStore = create<MeetPhotoStoreState>((set, get) => ({
    sheetSlug: null,
    sheetSource: null,
    sheetOpenCount: 0,
    revisions: {},
    focused: {},
    presented: {},
    openSheet: (slug, source) => {
        // Already showing this meet: it refetches on its own (revisions)
        if (get().focused[slug] || get().sheetSlug === slug) return;
        set({
            sheetSlug: slug,
            sheetSource: source,
            sheetOpenCount: get().sheetOpenCount + 1,
            presented: { ...get().presented, [slug]: true },
        });
    },
    closeSheet: () => set({ sheetSlug: null, sheetSource: null }),
    bump: (slug) => set({ revisions: { ...get().revisions, [slug]: (get().revisions[slug] ?? 0) + 1 } }),
}));

export const openMeetPhotoSheet = (slug: string, source: MeetPhotoSheetSource): void =>
    useMeetPhotoStore.getState().openSheet(slug, source);

export const closeMeetPhotoSheet = (): void => useMeetPhotoStore.getState().closeSheet();

export const bumpMeetPhoto = (slug: string): void => useMeetPhotoStore.getState().bump(slug);

/** While a screen shows this meet's photo itself; returns the release. */
export function focusMeetPhoto(slug: string): () => void {
    const { focused } = useMeetPhotoStore.getState();
    useMeetPhotoStore.setState({ focused: { ...focused, [slug]: (focused[slug] ?? 0) + 1 } });
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const current = useMeetPhotoStore.getState().focused;
        const next = { ...current, [slug]: Math.max(0, (current[slug] ?? 1) - 1) };
        if (!next[slug]) delete next[slug];
        useMeetPhotoStore.setState({ focused: next });
    };
}

const skipKey = (slug: string) => `meet_photo_skip:${slug}`;

export async function isMeetPhotoSkipped(slug: string): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(skipKey(slug))) === '1';
    } catch {
        return false;
    }
}

export async function skipMeetPhoto(slug: string): Promise<void> {
    await AsyncStorage.setItem(skipKey(slug), '1').catch(() => {});
}

/** The socket envelope the backend publishes (posts/src/meet_photos.py _event). */
export interface MeetPhotoEvent {
    type: 'meet_photo';
    slug: string;
    status: string;
    photo_id?: number;
    by?: { user_id: number; username: string };
}

export function isMeetPhotoEvent(event: any): event is MeetPhotoEvent {
    return !!event && event.type === 'meet_photo' && typeof event.slug === 'string' && typeof event.status === 'string';
}

/**
 * What a socket event or a push means for the sheet: a new request for you
 * opens it; the photographer's results (said yes, passed, can't be used)
 * and "ready" open it too. Everything else only refreshes what's on screen.
 */
export function sheetOpensFor(status: string): boolean {
    return status === 'pending' || status === 'minted' || status === 'rejected' || status === 'moderation_failed';
}

/** A socket event or a push about a meet's photo: refresh it, and open the sheet when it's news for this person. */
export function handleMeetPhotoSignal(slug: string, status: string, source: 'socket' | 'push'): void {
    bumpMeetPhoto(slug);
    if (sheetOpensFor(status)) openMeetPhotoSheet(slug, source);
}
