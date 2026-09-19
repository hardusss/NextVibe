/**
 * Boot signals the pending-intent consumer waits for. Nothing here navigates.
 *
 * appReady is true only when ALL of:
 *  - the root <Stack> is mounted (router.navigate will not throw),
 *  - the start flow is over: Splash finished its OTA check (capped at 3 s)
 *    and its auth check, or the app booted straight into a screen that
 *    bypasses Splash (deep link),
 *  - the user is signed in,
 *  - the profile (getUserDetail in the root layout) loaded once, or
 *    PROFILE_WAIT_MS passed since sign-in was known. The cap keeps a slow or
 *    failed request from holding the intent forever.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type AuthStatus = 'unknown' | 'in' | 'out';

/** Longest we wait for the first profile load before navigating anyway. */
export const PROFILE_WAIT_MS = 4000;
/** Longest Splash waits for Updates.checkForUpdateAsync(). */
export const OTA_CHECK_TIMEOUT_MS = 3000;

interface AppReadyState {
    routerMounted: boolean;
    bootstrapDone: boolean;
    otaSettled: boolean;
    authStatus: AuthStatus;
    /** Date.now() when authStatus last became 'in'. */
    authSince: number;
    profileLoaded: boolean;
    /** Bumped by sign-in/sign-out so the root layout re-reads the session without a route change. */
    authVersion: number;

    setRouterMounted: (mounted: boolean) => void;
    markOtaSettled: () => void;
    /** The start flow is over (Splash decided, or was bypassed). Implies the OTA check is settled. */
    markBootstrapDone: () => void;
    setAuthStatus: (status: AuthStatus) => void;
    setProfileLoaded: (loaded: boolean) => void;
    bumpAuth: () => void;
}

export const useAppReadyStore = create<AppReadyState>((set, get) => ({
    routerMounted: false,
    bootstrapDone: false,
    otaSettled: false,
    authStatus: 'unknown',
    authSince: 0,
    profileLoaded: false,
    authVersion: 0,

    setRouterMounted: (routerMounted) => {
        if (get().routerMounted !== routerMounted) set({ routerMounted });
    },
    markOtaSettled: () => {
        if (!get().otaSettled) set({ otaSettled: true });
    },
    markBootstrapDone: () => {
        const { bootstrapDone, otaSettled } = get();
        if (!bootstrapDone || !otaSettled) set({ bootstrapDone: true, otaSettled: true });
    },
    setAuthStatus: (authStatus) => {
        const prev = get().authStatus;
        if (prev === authStatus) return;
        set({
            authStatus,
            authSince: authStatus === 'in' ? Date.now() : get().authSince,
            // A sign-out invalidates the previous profile load.
            profileLoaded: authStatus === 'in' ? get().profileLoaded : false,
        });
    },
    setProfileLoaded: (profileLoaded) => {
        if (get().profileLoaded !== profileLoaded) set({ profileLoaded });
    },
    bumpAuth: () => set({ authVersion: get().authVersion + 1 }),
}));

export type AppReadySnapshot = Pick<AppReadyState, 'routerMounted' | 'bootstrapDone' | 'otaSettled' | 'authStatus' | 'authSince' | 'profileLoaded'>;

/** Pure so it can be unit-tested; `intentHydrated` comes from the intent store. */
export function computeAppReady(s: AppReadySnapshot, intentHydrated: boolean, now: number): boolean {
    if (!s.routerMounted || !intentHydrated || !s.bootstrapDone || !s.otaSettled) return false;
    if (s.authStatus !== 'in') return false;
    if (s.profileLoaded) return true;
    return s.authSince > 0 && now - s.authSince >= PROFILE_WAIT_MS;
}

/** Milliseconds until the profile cap would flip appReady on its own, or null. */
export function msUntilProfileCap(s: AppReadySnapshot, now: number): number | null {
    if (s.authStatus !== 'in' || s.profileLoaded || s.authSince <= 0) return null;
    return Math.max(0, s.authSince + PROFILE_WAIT_MS - now);
}

/**
 * React hook: true when the consumer may navigate. Re-renders when the profile
 * cap elapses so a hung profile request cannot hold the intent.
 */
export function useAppReady(intentHydrated: boolean): boolean {
    const snapshot: AppReadySnapshot = useAppReadyStore(useShallow((s) => ({
        routerMounted: s.routerMounted,
        bootstrapDone: s.bootstrapDone,
        otaSettled: s.otaSettled,
        authStatus: s.authStatus,
        authSince: s.authSince,
        profileLoaded: s.profileLoaded,
    })));
    const [, setTick] = useState(0);

    const ready = computeAppReady(snapshot, intentHydrated, Date.now());

    useEffect(() => {
        if (ready) return;
        const wait = msUntilProfileCap(snapshot, Date.now());
        if (wait === null) return;
        const timer = setTimeout(() => setTick((t) => t + 1), wait + 10);
        return () => clearTimeout(timer);
    }, [ready, snapshot.authStatus, snapshot.authSince, snapshot.profileLoaded]);

    return ready;
}

/** Test helper. */
export function __resetAppReadyForTests(): void {
    useAppReadyStore.setState({
        routerMounted: false,
        bootstrapDone: false,
        otaSettled: false,
        authStatus: 'unknown',
        authSince: 0,
        profileLoaded: false,
        authVersion: 0,
    });
}
