/**
 * Every "signed in → go to home/profile" handler goes through here, so a push
 * tap or deep link that arrived while signed out still wins: the pending
 * intent is opened by the root layout's consumer instead.
 */
import type { Router } from 'expo-router';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import { useAppReadyStore } from './appReadyStore';
import { clearPendingIntent, intentOwnsNavigation } from './pendingIntent';

/** Sign-in handlers write the session without awaiting; give it a moment. */
async function waitForSession(maxMs = 1500): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        try {
            if (await storage.getItem('id')) return true;
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    return false;
}

export async function navigateAfterSignIn(
    router: Router,
    fallback: '/home' | '/profile',
    method: 'replace' | 'push' = 'replace',
): Promise<void> {
    const hasSession = await waitForSession();
    const boot = useAppReadyStore.getState();
    if (hasSession) boot.setAuthStatus('in');
    boot.markBootstrapDone();
    boot.bumpAuth(); // root layout re-reads the user and loads the profile

    if (hasSession && intentOwnsNavigation()) {
        walletLogger.info(WalletTag.NAV_INTENT, `Signed in; pending intent owns navigation (skipping ${fallback})`);
        return;
    }
    if (method === 'push') router.push(fallback);
    else router.replace(fallback);
}

/** Logout / account deletion: nothing from the old session may navigate later. */
export function resetNavigationSession(): void {
    clearPendingIntent();
    const boot = useAppReadyStore.getState();
    boot.setAuthStatus('out');
    boot.bumpAuth();
}
