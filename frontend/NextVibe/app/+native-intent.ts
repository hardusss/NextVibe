import { extractProximityToken } from '@/src/proximity/payload';
import { enqueueProximityLink } from '@/src/proximity/linkQueue';
import { seekerLinkPath } from '@/src/utils/seekerShare';

/**
 * Intercepts incoming system deep links before expo-router navigates.
 *
 * Wallet apps (Phantom/Solflare/Backpack) redirect back to
 * `nextvibe://wallet-redirect?...` after a connect request. That callback is
 * consumed by the Linking listener in `hooks/useMwaAdapter.ios.ts`; there is no
 * `/wallet-redirect` route, so without this file expo-router lands on the
 * "Unmatched Route" screen. Returning `null` keeps the app on the current
 * screen while the wallet handshake completes.
 *
 * Tap links (`/u/e?t=…`, delivered when an iPhone or Android phone reads
 * another phone's NFC tag, or when such a link is opened) don't navigate at
 * all: they go to the shared tap prompt, which slides up over whatever is on
 * screen. On a cold start the app boots normally (splash → home) with the
 * prompt on top, so there is never a dead-end screen without a back stack.
 *
 * Username links (nextvibe://profile/<username> from the Seeker share page's
 * "Open in NextVibe", or the page itself at nextvibe.io/v/<username>) go to
 * /v/<username>, which looks the username up and opens that profile.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
    try {
        if (path.includes('wallet-redirect')) {
            return null;
        }
        if (extractProximityToken(path)) {
            enqueueProximityLink(path);
            return initial ? '/' : null;
        }
        const usernamePath = seekerLinkPath(path);
        if (usernamePath) {
            return usernamePath;
        }
        return path;
    } catch {
        return path;
    }
}
