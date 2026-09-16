import { create } from 'zustand';

/**
 * Blocks and unblocks made during this session.
 *
 * The backend already leaves blocked people out of every list, but screens
 * that are already loaded keep their rows until they refetch. They read
 * `overrides` to drop (or bring back) someone's content right away.
 */
interface BlockState {
    /** userId → true if blocked this session, false if unblocked this session. */
    overrides: Record<number, boolean>;
    setBlocked: (userId: number, blocked: boolean) => void;
    /** Call on sign out so the next account starts clean. */
    reset: () => void;
}

export const useBlockStore = create<BlockState>((set) => ({
    overrides: {},
    setBlocked: (userId, blocked) =>
        set((state) => ({ overrides: { ...state.overrides, [userId]: blocked } })),
    reset: () => set({ overrides: {} }),
}));

/** True if this person was blocked during this session (and not unblocked since). */
export const isBlockedInSession = (overrides: Record<number, boolean>, userId?: number | null) =>
    userId != null && overrides[userId] === true;
