/**
 * What a push tap or a deep link *means* for navigation, without navigating.
 *
 * Every entry point (push listeners, the last notification response on a cold
 * start, Linking, app/+native-intent.ts) turns its input into a PendingIntent
 * and hands it to the store in ./pendingIntent.ts. One consumer in the root
 * layout navigates once the app is ready (see ./appReadyStore.ts).
 *
 * Pure and dependency-free (apart from the URL helpers in src/proximity) so it
 * can be unit-tested in node and imported from +native-intent.ts.
 */
import { parseQuery, toAppPath } from '@/src/proximity/payload';

export type IntentSource = 'push' | 'link';

export interface PendingIntent {
    /** Stable id for dedup: the notification identifier, or the link + a bucket. */
    id: string;
    /** expo-router pathname, e.g. '/(tabs)/profile'. */
    path: string;
    params?: Record<string, string>;
    source: IntentSource;
    /** Push `data.type` or 'profile-link'; drives consumer side-effects and logs. */
    kind?: string;
    createdAt: number;
}

/** The own-profile screen; `open=seeker` asks it to present the Seeker Verified sheet. */
export const PROFILE_PATH = '/(tabs)/profile';
export const SEEKER_OPEN_PARAM = 'seeker';


/** Splits "/a/b?x=1&y=2" into a pathname and decoded params. */
export function splitHref(href: string): { path: string; params: Record<string, string> } {
    const q = href.indexOf('?');
    const rawPath = q === -1 ? href : href.slice(0, q);
    const path = rawPath.replace(/\/+$/, '') || '/';
    const params = parseQuery(q === -1 ? undefined : href.slice(q + 1));
    return { path, params };
}

/** Route aliases the app uses in push payloads; everything else is passed through. */
function normalizePath(path: string): string {
    if (path === '/profile' || path === '/(tabs)/profile' || path === '/(tabs)/profile/index') return PROFILE_PATH;
    return path;
}

function seekerIntent(id: string, source: IntentSource, createdAt: number, extra?: Record<string, string>): PendingIntent {
    return {
        id,
        path: PROFILE_PATH,
        params: { ...(extra ?? {}), open: SEEKER_OPEN_PARAM },
        source,
        kind: 'seeker_verified',
        createdAt,
    };
}

export interface NotificationIntent {
    intent?: PendingIntent;
    /** An https/other-app link the push wants opened outside the app. */
    external?: string;
}

/**
 * Maps push `data` to an intent. Mirrors the old resolveNotificationUrl table
 * in app/_layout.tsx. `seeker_verified` always opens the own profile with the
 * sheet, even when the campaign console also attached a `url`.
 */
export function intentFromNotification(
    data: Record<string, any> | null | undefined,
    notificationId: string,
    now: number,
): NotificationIntent {
    if (!data || typeof data !== 'object') return {};
    const id = `push:${notificationId}`;
    const type = typeof data.type === 'string' ? data.type : undefined;

    if (type === 'seeker_verified') {
        return { intent: seekerIntent(id, 'push', now) };
    }
    if (typeof data.external_url === 'string' && data.external_url) {
        return { external: data.external_url };
    }
    if (typeof data.url === 'string' && data.url) {
        const { path, params } = splitHref(data.url);
        return { intent: { id, path: normalizePath(path), params, source: 'push', kind: type ?? 'url', createdAt: now } };
    }

    const p = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
    switch (type) {
        case 'new_follower':
            return p(data.user_id)
                ? { intent: { id, path: '/user-profile', params: { id: p(data.user_id)! }, source: 'push', kind: type, createdAt: now } }
                : {};
        case 'new_like':
        case 'new_comment':
            return p(data.post_id)
                ? { intent: { id, path: '/post-details', params: { id: p(data.post_id)! }, source: 'push', kind: type, createdAt: now } }
                : {};
        case 'new_message':
        case 'chat_message':
            return p(data.chat_id)
                ? { intent: { id, path: '/(shared)/chat-room', params: { id: p(data.chat_id)! }, source: 'push', kind: type, createdAt: now } }
                : {};
        case 'cherry_chat':
            return { intent: { id, path: '/(shared)/cherry-chat', source: 'push', kind: type, createdAt: now } };
        default:
            return {};
    }
}

/**
 * Own-profile links only: nextvibe://profile, nextvibe://profile?open=seeker,
 * https://nextvibe.io/profile?open=seeker. Username links (/profile/<name>),
 * wallet redirects and tap links are somebody else's and return null.
 */
export function intentFromUrl(url: string, initial: boolean, now: number): PendingIntent | null {
    const appPath = toAppPath(url);
    if (!appPath) return null;
    const { path, params } = splitHref(appPath);
    if (path !== '/profile') return null;
    // One link usually arrives twice (+native-intent and Linking); the store
    // drops the second copy by signature (see LINK_DEDUP_MS in pendingIntent.ts).
    const id = `link:${initial ? 'initial:' : ''}${url.trim()}@${now}`;
    if (params.open === SEEKER_OPEN_PARAM) return seekerIntent(id, 'link', now, params);
    return { id, path: PROFILE_PATH, params, source: 'link', kind: 'profile-link', createdAt: now };
}

/** Dedup key for links: same destination = same intent. */
export function intentSignature(intent: Pick<PendingIntent, 'path' | 'params'>): string {
    const params = intent.params ?? {};
    const keys = Object.keys(params).sort();
    return `${intent.path}?${keys.map((k) => `${k}=${params[k]}`).join('&')}`;
}

/** Routes where the consumer should `replace` instead of `navigate`. */
export const BOOTSTRAP_PATHS = new Set(['/', '/splash', '/eas-update', '/login', '/register']);

export function isBootstrapPath(pathname: string | null | undefined): boolean {
    return !pathname || BOOTSTRAP_PATHS.has(pathname);
}

export type NavigationMethod = 'replace' | 'navigate' | 'dismissTo' | 'push';

/**
 * - From the start flow (splash, eas-update, login/register): replace, so
 *   there's no splash left under the destination.
 * - Tab routes (the own profile): navigate when the tabs are on top (switches
 *   tab in place); dismissTo when a shared screen or modal covers them, which
 *   pops back to the existing (tabs) instead of stacking a second one.
 *   (React Navigation 7's stack NAVIGATE pushes a new route unless it's the
 *   current one.)
 * - Everything else (post, chat, another profile): push, as before.
 */
export function pickNavigationMethod(pathname: string, firstSegment: string | undefined, intent: Pick<PendingIntent, 'path'>): NavigationMethod {
    if (isBootstrapPath(pathname)) return 'replace';
    if (intent.path.startsWith('/(tabs)/')) return firstSegment === '(tabs)' ? 'navigate' : 'dismissTo';
    return 'push';
}
