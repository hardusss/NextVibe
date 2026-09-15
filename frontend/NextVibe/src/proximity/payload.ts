/**
 * Parsing of what one phone hands to another over BLE / NFC / a shared link.
 * Pure and dependency-free so it can be unit-tested in node.
 */

export type ProximityPayload =
    | { kind: 'token'; token: string }
    | { kind: 'profile'; userId: number }
    | { kind: 'post'; postId: number }
    | { kind: 'payment'; path: string; amount?: string; tokenSymbol?: string; address?: string }
    | { kind: 'legacy'; path: string }
    | { kind: 'unknown' };

const ORIGINS = [
    'https://www.nextvibe.io',
    'http://www.nextvibe.io',
    'https://nextvibe.io',
    'http://nextvibe.io',
    'www.nextvibe.io',
    'nextvibe.io',
    'nextvibe://',
];

// secrets.token_urlsafe(n) alphabet; the backend currently issues 8 chars.
const TOKEN_RE = /^[A-Za-z0-9_-]{4,128}$/;

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
}

export function parseQuery(query: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!query) return out;
    for (const part of query.split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const key = safeDecode(eq === -1 ? part : part.slice(0, eq));
        const value = eq === -1 ? '' : safeDecode(part.slice(eq + 1));
        if (key && !(key in out)) out[key] = value;
    }
    return out;
}

/**
 * Turns a NextVibe URL (any of our origins/scheme) into an in-app path like
 * "/u/e?t=abc". Returns null for anything that isn't ours.
 */
export function toAppPath(raw: string): string | null {
    if (!raw) return null;
    let value = raw.trim();
    if (!value) return null;

    let matched = false;
    for (const origin of ORIGINS) {
        if (value.toLowerCase().startsWith(origin)) {
            const rest = value.slice(origin.length);
            // "https://nextvibe.io.evil.com/…" must not count as ours.
            if (origin !== 'nextvibe://' && rest !== '' && !/^[/?#]/.test(rest)) return null;
            value = rest;
            matched = true;
            break;
        }
    }
    if (!matched && !value.startsWith('/')) return null;

    value = value.split('#')[0];
    if (!value.startsWith('/')) value = `/${value}`;
    // Collapse accidental double slashes ("nextvibe:///u/1").
    value = value.replace(/^\/+/, '/');
    return value;
}

/** Splits "/a/b?x=1" into ["/a/b" without trailing slash, query object]. */
function splitPath(path: string): [string, Record<string, string>] {
    const q = path.indexOf('?');
    const pathname = (q === -1 ? path : path.slice(0, q)).replace(/\/+$/, '') || '/';
    return [pathname, parseQuery(q === -1 ? undefined : path.slice(q + 1))];
}

export function parseProximityPayload(raw: string): ProximityPayload {
    const path = toAppPath(raw);
    if (!path) return { kind: 'unknown' };

    const [pathname, query] = splitPath(path);

    // Proximity token: /u/e?t=… (or the short /e?t=…). Any of our paths
    // carrying `t` is treated the same, matching the u/[id] route.
    if (query.t !== undefined) {
        const token = query.t.trim();
        return TOKEN_RE.test(token) ? { kind: 'token', token } : { kind: 'unknown' };
    }

    if (pathname === '/u/send') {
        return {
            kind: 'payment',
            path,
            amount: query.amount,
            tokenSymbol: query.token,
            address: query.address,
        };
    }

    const post = pathname.match(/^\/u\/post\/(\d+)$/);
    if (post) return { kind: 'post', postId: Number(post[1]) };

    const profile = pathname.match(/^\/u\/(\d+)$/);
    if (profile) return { kind: 'profile', userId: Number(profile[1]) };

    // Pre-token formats that some old installs may still broadcast.
    if (pathname === '/event-checkin' && query.postId) return { kind: 'legacy', path };
    if (pathname === '/event-nfc-receive' && query.userId) return { kind: 'legacy', path };

    return { kind: 'unknown' };
}

/** The proximity token inside a link, or null. */
export function extractProximityToken(raw: string): string | null {
    const payload = parseProximityPayload(raw);
    return payload.kind === 'token' ? payload.token : null;
}

/** Stable dedup key for a payload (token for token links, the path otherwise). */
export function payloadKey(raw: string, payload: ProximityPayload): string {
    if (payload.kind === 'token') return `t:${payload.token}`;
    return `p:${toAppPath(raw) ?? raw}`;
}
