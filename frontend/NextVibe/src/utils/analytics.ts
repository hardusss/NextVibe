import { customEvent } from 'vexo-analytics';

/**
 * Vexo custom event. Vexo only starts in release builds that have an API key
 * (app/_layout.tsx); anywhere else this is a no-op instead of a console warning.
 */
export function track(name: string, props: Record<string, string | number | boolean> = {}): void {
    if (__DEV__ || !process.env.EXPO_PUBLIC_VEXO_API_KEY) return;
    try {
        customEvent(name, props);
    } catch {
        // analytics must never break the action being tracked
    }
}
