import { extractProximityToken } from '@/src/proximity/payload';
import { enqueueProximityLink } from '@/src/proximity/linkQueue';
import { seekerLinkPath } from '@/src/utils/seekerShare';
import { intentFromUrl } from '@/src/navigation/intents';
import { enqueueIntentLink } from '@/src/navigation/intentQueue';

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
 * Username links (the Seeker share page nextvibe.io/u/verified/<username>, or
 * its "Open in NextVibe" at nextvibe://profile/<username>) go to
 * /u/verified/<username>, which looks the username up and opens that profile.
 *
 * Own-profile links (nextvibe://profile, nextvibe://profile?open=seeker) are
 * handed to the pending-intent gate (src/navigation) instead of being opened
 * here: on a cold start the app boots normally (splash → OTA check → auth) and
 * the root layout opens the profile, with the Seeker sheet, once it's ready.
 * Opening /profile directly skipped the start flow, and Splash's redirect to
 * /home then took the screen back.
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
        if (intentFromUrl(path, initial, 0)) {
            enqueueIntentLink(path, initial);
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
