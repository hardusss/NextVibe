import type { Router } from 'expo-router';

/**
 * router.back() that never dead-ends. Screens opened straight from an NFC tap
 * or a link on a cold start have no history, so back() silently did nothing
 * and the "Go Back"/"Done" buttons looked broken.
 */
export function safeBack(router: Router, fallback: string = '/home'): void {
    if (router.canGoBack()) {
        router.back();
    } else {
        router.replace(fallback as any);
    }
}
