/**
 * Hand-off for deep links that reach app/+native-intent.ts before the root
 * layout has mounted (same shape as src/proximity/linkQueue.ts).
 *
 * Deliberately dependency-free: +native-intent.ts runs while expo-router is
 * still building its linking config, before any React tree exists.
 */

export interface QueuedLink {
    url: string;
    initial: boolean;
    receivedAt: number;
}

type Listener = (link: QueuedLink) => void;

const pending: QueuedLink[] = [];
let listener: Listener | null = null;

export function enqueueIntentLink(url: string, initial: boolean): void {
    const link: QueuedLink = { url, initial, receivedAt: Date.now() };
    if (listener) {
        listener(link);
        return;
    }
    if (!pending.some((p) => p.url === url && p.initial === initial)) pending.push(link);
}

/** The root layout subscribes once; queued links are delivered immediately. */
export function subscribeIntentLinks(next: Listener): () => void {
    listener = next;
    while (pending.length) {
        const link = pending.shift();
        if (link) next(link);
    }
    return () => {
        if (listener === next) listener = null;
    };
}
