import * as Location from 'expo-location';

export type QuickLocation =
    | { status: 'ok'; latitude: number; longitude: number }
    | { status: 'denied' | 'servicesOff' | 'mocked' | 'unavailable' };

type Options = {
    /** Show the system permission prompt if it hasn't been answered yet. */
    request?: boolean;
    /** Give up on a fresh GPS fix after this long. */
    timeoutMs?: number;
    /** A cached fix younger than this is good enough (people don't move far during a tap). */
    maxAgeMs?: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                resolve(null);
            }
        );
    });
}

/**
 * Location for a tap without ever hanging the UI: cached fix first, then a
 * fresh one capped by `timeoutMs`. Indoors a Balanced fix can take tens of
 * seconds — the old code awaited it with no limit while people stood there.
 */
export async function getQuickLocation({
    request = false,
    timeoutMs = 4000,
    maxAgeMs = 120_000,
}: Options = {}): Promise<QuickLocation> {
    try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted && request && permission.canAskAgain) {
            permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!permission.granted) return { status: 'denied' };

        const servicesOn = await withTimeout(Location.hasServicesEnabledAsync(), 1500);
        if (servicesOn === false) return { status: 'servicesOff' };

        const cached = await withTimeout(
            Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: 300 }),
            800
        );
        if (cached) {
            if (cached.mocked) return { status: 'mocked' };
            return { status: 'ok', latitude: cached.coords.latitude, longitude: cached.coords.longitude };
        }

        const fresh = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            timeoutMs
        );
        if (!fresh) return { status: 'unavailable' };
        if (fresh.mocked) return { status: 'mocked' };
        return { status: 'ok', latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
    } catch {
        return { status: 'unavailable' };
    }
}

/**
 * Starts a background fix when permission is already granted so the cached
 * position is ready by the time someone taps. Never prompts.
 */
export function warmUpLocation(): void {
    Location.getForegroundPermissionsAsync()
        .then((permission) => {
            if (!permission.granted) return;
            return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        })
        .catch(() => {});
}
