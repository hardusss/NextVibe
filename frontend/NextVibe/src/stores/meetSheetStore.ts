/**
 * The Proof of Meet sheet (components/Meet/MeetSheet.tsx, mounted once in the
 * root layout). Anything can open it with a slug: a nextvibe.io/u/meet link
 * or push (through the pending-intent gate), a row in POAPs & History.
 */
import { create } from 'zustand';

export type MeetSheetSource = 'link' | 'push' | 'history';

interface MeetSheetState {
    slug: string | null;
    source: MeetSheetSource | null;
    /** Bumped on every open, so opening the same meet again presents it again. */
    openCount: number;
    open: (slug: string, source: MeetSheetSource) => void;
    close: () => void;
}

export const useMeetSheet = create<MeetSheetState>((set, get) => ({
    slug: null,
    source: null,
    openCount: 0,
    open: (slug, source) => set({ slug, source, openCount: get().openCount + 1 }),
    close: () => set({ slug: null, source: null }),
}));

export const openMeetSheet = (slug: string, source: MeetSheetSource = 'history'): void =>
    useMeetSheet.getState().open(slug, source);

export const closeMeetSheet = (): void => useMeetSheet.getState().close();
