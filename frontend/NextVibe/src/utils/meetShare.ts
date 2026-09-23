/**
 * Proof of Meet sharing: the meet page link, the card image URL and the X
 * post. Pure so it can be unit-tested in node.
 */
import GetApiUrl from './url_api';
import { toAppPath } from '../proximity/payload';
import { X_POST_LIMIT, xPostLength } from './seekerShare';

export const MEET_SITE = 'https://nextvibe.io';
const X_ACCOUNT = '@NextVibeWeb3';
/** The backend issues 12 characters; anything close is let through and answered with "not available". */
const SLUG_RE = /^[0-9A-Za-z]{4,64}$/;

export type MeetTier = 'in_person' | 'peer_verified' | 'organizer_verified';
export type MeetCardVariant = 'og' | 'story';

export interface MeetPerson {
    user_id: number;
    username: string;
    avatar: string | null;
    seeker_verified: boolean;
    official: boolean;
    deleted: boolean;
    points: number | null;
    meet_number: number;
}

/** GET /meet/<slug> */
export interface MeetData {
    slug: string;
    url: string;
    source: 'irl' | 'event';
    tier: MeetTier;
    tier_label: string;
    met_at: string;
    timezone: string | null;
    place: string | null;
    when_line: string;
    event: { id: number; name: string } | null;
    users: [MeetPerson, MeetPerson];
    pair: { count: number; first_met_at: string };
    history_line: string;
    proof_line: string;
    asset_id: string | null;
    title: string;
    description: string;
    card_url: string;
    story_url: string;
    version: string;
}

/** What the X post needs; built from the meet, or from the tap itself while that loads. */
export interface MeetShareInfo {
    slug: string;
    /** Who the viewer met, or null when the viewer isn't one of the two. */
    other: string | null;
    /** Both people, for a viewer who isn't one of them. */
    pair?: [string, string];
    atEvent: boolean;
    eventName: string | null;
    minted: boolean;
}

export function isMeetSlug(value: unknown): value is string {
    return typeof value === 'string' && SLUG_RE.test(value);
}

export function meetPageUrl(slug: string): string {
    return `${MEET_SITE}/u/meet/${slug}`;
}

/** The card image; `rev` (the meet's version) makes it cacheable and always current. */
export function meetCardUrl(slug: string, variant: MeetCardVariant = 'story', rev?: string | null): string {
    return `${GetApiUrl()}/meet/${slug}/card.png?v=${variant}${rev ? `&rev=${encodeURIComponent(rev)}` : ''}`;
}

function pathnameOf(raw: string): string | null {
    const path = toAppPath(raw);
    if (!path) return null;
    return path.split('?')[0].replace(/\/+$/, '') || '/';
}

/** The slug in a meet link (nextvibe.io/u/meet/<slug>, its /card.png, nextvibe://u/meet/<slug>), or null. */
export function meetLinkSlug(raw: string): string | null {
    const pathname = pathnameOf(raw);
    const match = pathname?.match(/^\/u\/meet\/([^/]+)(?:\/card\.png)?$/);
    return match && isMeetSlug(match[1]) ? match[1] : null;
}

/** nextvibe.io/u/meets: your history, where every meet has its card. */
export function isMeetsLink(raw: string): boolean {
    return pathnameOf(raw) === '/u/meets';
}

/** nextvibe.io/u/tap: straight into Tap to Meet (the first-tap email's button). */
export function isTapLink(raw: string): boolean {
    return pathnameOf(raw) === '/u/tap';
}

export function shareInfoFromMeet(meet: MeetData, viewerId?: number | null): MeetShareInfo {
    const [a, b] = meet.users;
    const other = viewerId === a.user_id ? b : viewerId === b.user_id ? a : null;
    return {
        slug: meet.slug,
        other: other?.username ?? null,
        pair: [a.username, b.username],
        atEvent: meet.source === 'event',
        eventName: meet.event?.name ?? null,
        minted: !!meet.asset_id,
    };
}

/**
 * The X post. Names are NextVibe usernames without "@": we don't know
 * anyone's X handle, and "@name" would tag whoever owns it on X. "Verified
 * on Solana" only once the meet is minted; until then it's recorded on
 * NextVibe (the card says so too). The meet-card email writes the same post
 * in Python (backend posts/src/meets.py x_post_text): keep the two in step.
 */
export function meetShareText(info: MeetShareInfo): string {
    const link = meetPageUrl(info.slug);
    const build = (eventName: string | null) => {
        const who = info.other
            ? `Met ${info.other}`
            : info.pair ? `${info.pair[0]} met ${info.pair[1]}` : 'Met someone';
        if (info.atEvent) {
            return `${who} at ${eventName ?? 'an event'} — checked in by tap, Proof of Meet on ${X_ACCOUNT}.\n${link}`;
        }
        const proof = info.minted ? `Proof of Meet on ${X_ACCOUNT}, verified on Solana.` : `Proof of Meet on ${X_ACCOUNT}.`;
        return `${who} in person — ${proof} Tap phones. Prove you met.\n${link}`;
    };
    let eventName = info.eventName;
    let text = build(eventName);
    // A long event name gets shortened so the post fits
    while (eventName && xPostLength(text) > X_POST_LIMIT && eventName.length > 8) {
        eventName = `${eventName.slice(0, -2).trimEnd()}…`;
        text = build(eventName);
    }
    return text;
}

export function meetShareIntentUrl(info: MeetShareInfo): string {
    return `https://x.com/intent/post?text=${encodeURIComponent(meetShareText(info))}`;
}
