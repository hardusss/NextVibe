/**
 * Hand-off for tap links that arrive through the OS (NFC tag read, universal
 * link, Android app link) before React is ready to show the prompt.
 *
 * Deliberately dependency-free: it is imported from app/+native-intent.ts,
 * which runs before the root layout mounts.
 */

type Listener = (url: string) => void;

const pending: string[] = [];
let listener: Listener | null = null;

export function enqueueProximityLink(url: string): void {
    if (listener) {
        listener(url);
        return;
    }
    // One tap often delivers the same link twice (NDEF + app link).
    if (!pending.includes(url)) pending.push(url);
}

/** The prompt host subscribes once; queued links are delivered immediately. */
export function subscribeProximityLinks(next: Listener): () => void {
    listener = next;
    while (pending.length) {
        const url = pending.shift();
        if (url) next(url);
    }
    return () => {
        if (listener === next) listener = null;
    };
}
