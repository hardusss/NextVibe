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
import { isMeetSlug, isMeetsLink, isTapLink, meetLinkSlug } from '@/src/utils/meetShare';

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
/** `open=meets`: the profile opens POAPs & History, where every meet has its card. */
export const MEETS_OPEN_PARAM = 'meets';
/**
 * nextvibe.io/u/meet/<slug> doesn't navigate: the consumer opens the meet
 * sheet over the current screen (home on a cold start). The path is the
 * fallback route, so a plain navigation still ends up in the same sheet.
 */
export const MEET_KIND = 'meet';
export const MEETS_KIND = 'meets';
/**
 * nextvibe.io/u/tap opens Tap to Meet in IRL mode, like the profile button
 * does when you're not at an event. The server switches the tap to an event
 * you're checked in to, so the link needs nothing else.
 */
export const TAP_KIND = 'tap';
export const TAP_PATH = '/event-nfc-share';
/**
 * A Proof of Meet photo push (a selfie waiting for your answer, their answer,
 * "ready"): the photo sheet opens over the current screen, like the meet sheet.
 */
export const MEET_PHOTO_KIND = 'meet_photo';
/**
 * nextvibe.io/u/collectibles (the "now on Solana" push): the own profile on
 * its cNFT tab.
 */
export const COLLECTIBLES_OPEN_PARAM = 'collectibles';
export const COLLECTIBLES_KIND = 'collectibles';
/**
 * nextvibe.io/u/wallet (the connect-a-wallet reminders, push and email): the
 * connect sheet opens over the current screen (home on a cold start).
 */
export const WALLET_KIND = 'wallet';
export const WALLET_PATH = '/u/wallet';


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

/**
 * Links that don't open a screen of their own (/u/meet/<slug>, /u/meets,
 * /u/tap, /u/collectibles, /u/wallet) as intents, or null for any other path.
 * Shared by links and push `url`s.
 */
function meetIntent(appPath: string, id: string, source: IntentSource, now: number): PendingIntent | null {
    const slug = meetLinkSlug(appPath);
    if (slug) {
        return { id, path: `/u/meet/${slug}`, params: { slug }, source, kind: MEET_KIND, createdAt: now };
    }
    if (isMeetsLink(appPath)) {
        return { id, path: PROFILE_PATH, params: { open: MEETS_OPEN_PARAM }, source, kind: MEETS_KIND, createdAt: now };
    }
    if (isTapLink(appPath)) {
        return { id, path: TAP_PATH, params: { mode: 'irl' }, source, kind: TAP_KIND, createdAt: now };
    }
    const { path } = splitHref(appPath);
    if (path === '/u/collectibles') {
        return { id, path: PROFILE_PATH, params: { open: COLLECTIBLES_OPEN_PARAM }, source, kind: COLLECTIBLES_KIND, createdAt: now };
    }
    if (path === WALLET_PATH) {
        return { id, path: WALLET_PATH, source, kind: WALLET_KIND, createdAt: now };
    }
    return null;
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
    if (type === MEET_PHOTO_KIND && isMeetSlug(data.slug)) {
        return {
            intent: { id, path: `/u/meet/${data.slug}`, params: { slug: data.slug }, source: 'push', kind: MEET_PHOTO_KIND, createdAt: now },
        };
    }
    if (typeof data.external_url === 'string' && data.external_url) {
        return { external: data.external_url };
    }
    if (typeof data.url === 'string' && data.url) {
        const meet = meetIntent(data.url, id, 'push', now);
        if (meet) return { intent: meet };
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
 * Links that wait for the app to be ready: own-profile links
 * (nextvibe://profile, nextvibe://profile?open=seeker,
 * https://nextvibe.io/profile?open=seeker) and Proof of Meet links
 * (nextvibe.io/u/meet/<slug>, nextvibe.io/u/meets, nextvibe.io/u/tap). Username links
 * (/profile/<name>), wallet redirects and tap links are somebody else's and
 * return null.
 */
export function intentFromUrl(url: string, initial: boolean, now: number): PendingIntent | null {
    const appPath = toAppPath(url);
    if (!appPath) return null;
    // One link usually arrives twice (+native-intent and Linking); the store
    // drops the second copy by signature (see LINK_DEDUP_MS in pendingIntent.ts).
    const id = `link:${initial ? 'initial:' : ''}${url.trim()}@${now}`;
    const meet = meetIntent(appPath, id, 'link', now);
    if (meet) return meet;
    const { path, params } = splitHref(appPath);
    if (path !== '/profile') return null;
    if (params.open === SEEKER_OPEN_PARAM) return seekerIntent(id, 'link', now, params);
    return { id, path: PROFILE_PATH, params, source: 'link', kind: 'profile-link', createdAt: now };
}

/** Every nextvibe.io/u/… path the app has a screen or flow for. */
const KNOWN_U_PATHS = [
    /^\/u\/\d+$/, // profile
    /^\/u\/e$/, // tap link (?t=…)
    /^\/u\/post\/\d+$/,
    /^\/u\/verified\/[^/]+$/,
    /^\/u\/meet\/[^/]+(?:\/card\.png)?$/,
    /^\/u\/meets$/,
    /^\/u\/tap$/, // Tap to Meet
    /^\/u\/collectibles$/, // the cNFT tab
    /^\/u\/wallet$/, // the connect-a-wallet sheet
    /^\/u\/send(?:\/.*)?$/, // payment requests
];

/**
 * A NextVibe link under /u/ that no screen handles (a new share page the
 * installed version doesn't know yet, a mangled link): the app opens home
 * instead of "Unmatched Route".
 */
export function isUnknownUPath(url: string): boolean {
    const appPath = toAppPath(url);
    if (!appPath) return false;
    const { path } = splitHref(appPath);
    if (path !== '/u' && !path.startsWith('/u/')) return false;
    return !KNOWN_U_PATHS.some((re) => re.test(path));
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

export type NavigationMethod = 'replace' | 'homeThenPush' | 'navigate' | 'dismissTo' | 'push';

/**
 * - From the start flow (splash, eas-update, login/register): replace for tab
 *   routes, so there's no splash left under the destination. Other screens
 *   (post, chat, another profile) get home underneath first, so their back
 *   button has somewhere to go.
 * - Tab routes (the own profile): navigate when the tabs are on top (switches
 *   tab in place); dismissTo when a shared screen or modal covers them, which
 *   pops back to the existing (tabs) instead of stacking a second one.
 *   (React Navigation 7's stack NAVIGATE pushes a new route unless it's the
 *   current one.)
 * - Everything else (post, chat, another profile): push, as before.
 */
export function pickNavigationMethod(pathname: string, firstSegment: string | undefined, intent: Pick<PendingIntent, 'path'>): NavigationMethod {
    if (isBootstrapPath(pathname)) return intent.path.startsWith('/(tabs)/') ? 'replace' : 'homeThenPush';
    if (intent.path.startsWith('/(tabs)/')) return firstSegment === '(tabs)' ? 'navigate' : 'dismissTo';
    return 'push';
}
