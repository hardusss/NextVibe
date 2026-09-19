/**
 * "Share on X" for Seeker Verified users: the share page link, the post text
 * and the card image URL. Pure so it can be unit-tested in node.
 */
import GetApiUrl from './url_api';
import { toAppPath } from '../proximity/payload';

export const SEEKER_SHARE_ORIGIN = 'https://nextvibe.io';
/**
 * Share page path. Under /u because Android already opens nextvibe.io/u/* in
 * the app (intent filter in app.config.js); a new prefix would need a native
 * rebuild and a reinstall.
 */
export const SEEKER_SHARE_PATH = '/u/verified/';
export const X_POST_LIMIT = 280;
/** X shortens every link to a 23-character t.co URL, whatever its length. */
const X_LINK_LENGTH = 23;

/** Same escaping as the backend's quote(safe=''), so both build identical links. */
function encodeSegment(value: string): string {
    return encodeURIComponent(value).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function seekerSharePageUrl(username: string): string {
    return `${SEEKER_SHARE_ORIGIN}${SEEKER_SHARE_PATH}${encodeSegment(username)}`;
}

/** Always the latest card: the backend only lets CDNs keep versioned (?v=) URLs. */
export function seekerCardUrl(username: string): string {
    return `${GetApiUrl()}/users/${encodeSegment(username)}/seeker-card.png`;
}

export function seekerShareText(username: string, source?: string | null): string {
    // Accounts verified by their .skr name never had a Genesis Token check
    const proof = source === 'skr' ? 'Seeker ID (.skr) confirmed.' : 'Genesis Token confirmed on-chain.';
    return [
        `I'm Seeker Verified on @NextVibeWeb3 — ${proof}`,
        'Tap phones. Prove you met.',
        seekerSharePageUrl(username),
    ].join('\n');
}

export function seekerShareIntentUrl(username: string, source?: string | null): string {
    return `https://x.com/intent/post?text=${encodeURIComponent(seekerShareText(username, source))}`;
}

/** Post length the way X counts it: each link is 23 characters. */
export function xPostLength(text: string): number {
    const links = text.match(/https?:\/\/\S+/g) ?? [];
    const withoutLinks = links.reduce((rest, link) => rest.replace(link, ''), text);
    return Array.from(withoutLinks).length + links.length * X_LINK_LENGTH;
}

/**
 * In-app route for a username link, or null. The share page itself
 * (nextvibe.io/u/verified/<username>, opened in the app), its "Open in
 * NextVibe" (nextvibe://profile/<username>) and the first test links
 * (nextvibe.io/v/<username>) all go to /u/verified/<username>, which looks
 * the username up and opens that profile.
 */
export function seekerLinkPath(raw: string): string | null {
    const path = toAppPath(raw);
    if (!path) return null;
    const pathname = path.split('?')[0].replace(/\/+$/, '');
    const match = pathname.match(/^\/(?:profile|v|u\/verified)\/([^/]+)$/);
    return match ? `${SEEKER_SHARE_PATH}${match[1]}` : null;
}
