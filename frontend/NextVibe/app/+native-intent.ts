/**
 * Intercepts incoming system deep links before expo-router navigates.
 *
 * Wallet apps (Phantom/Solflare/Backpack) redirect back to
 * `nextvibe://wallet-redirect?...` after a connect request. That callback is
 * consumed by the Linking listener in `hooks/useMwaAdapter.ios.ts`; there is no
 * `/wallet-redirect` route, so without this file expo-router lands on the
 * "Unmatched Route" screen. Returning `null` keeps the app on the current
 * screen while the wallet handshake completes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
    try {
        if (path.includes('wallet-redirect')) {
            return null;
        }
        return path;
    } catch {
        return path;
    }
}
