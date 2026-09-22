import {
    isMeetsLink,
    meetCardUrl,
    meetLinkSlug,
    meetPageUrl,
    meetShareIntentUrl,
    meetShareText,
    shareInfoFromMeet,
    type MeetData,
    type MeetShareInfo,
} from '../meetShare';
import { xPostLength, X_POST_LIMIT } from '../seekerShare';

const person = (user_id: number, username: string) => ({
    user_id, username, avatar: null, seeker_verified: false, official: false, deleted: false, points: 1, meet_number: 1,
});

const meet = (extra: Partial<MeetData> = {}): MeetData => ({
    slug: 'ef91kGQl0v0k',
    url: 'https://nextvibe.io/u/meet/ef91kGQl0v0k',
    source: 'irl',
    tier: 'in_person',
    tier_label: 'IN PERSON',
    met_at: '2026-09-21T16:42:00+00:00',
    timezone: 'Europe/Kyiv',
    place: 'Kyiv',
    when_line: 'Kyiv · Mon, Sep 21 · 19:42',
    event: null,
    users: [person(1, 'javrpelayo'), person(2, 'cakeandroll.skr')],
    pair: { count: 1, first_met_at: '2026-09-21T16:42:00+00:00' },
    history_line: '+1 REP each · #1 for @javrpelayo · #1 for @cakeandroll.skr',
    proof_line: 'Proof of Meet · recorded on NextVibe',
    asset_id: null,
    title: '@javrpelayo met @cakeandroll.skr · NextVibe',
    description: '',
    card_url: '',
    story_url: '',
    version: '26f2b0ed80',
    ...extra,
});

describe('meetShare', () => {
    it('in person: names the other person without @, no Solana claim before minting', () => {
        const text = meetShareText(shareInfoFromMeet(meet(), 1));
        expect(text).toBe(
            'Met cakeandroll.skr in person — Proof of Meet on @NextVibeWeb3. Tap phones. Prove you met.\n' +
            'https://nextvibe.io/u/meet/ef91kGQl0v0k',
        );
        expect(meetShareText(shareInfoFromMeet(meet(), 2))).toMatch(/^Met javrpelayo in person/);
    });

    it('in person, minted: verified on Solana', () => {
        const text = meetShareText(shareInfoFromMeet(meet({ asset_id: '8xKpQ1v9z3fQ' }), 1));
        expect(text).toContain('Proof of Meet on @NextVibeWeb3, verified on Solana. Tap phones. Prove you met.');
    });

    it('at an event: the event name, checked in by tap', () => {
        const info = shareInfoFromMeet(meet({
            source: 'event', tier: 'organizer_verified', event: { id: 7, name: 'Superteam Ukraine Vibeathon' },
        }), 2);
        expect(meetShareText(info)).toBe(
            'Met javrpelayo at Superteam Ukraine Vibeathon — checked in by tap, Proof of Meet on @NextVibeWeb3.\n' +
            'https://nextvibe.io/u/meet/ef91kGQl0v0k',
        );
    });

    it('someone else sharing it names both people', () => {
        expect(meetShareText(shareInfoFromMeet(meet(), 99))).toMatch(/^javrpelayo met cakeandroll\.skr in person/);
    });

    it('while the meet loads, the tap alone is enough', () => {
        const info: MeetShareInfo = {
            slug: 'ef91kGQl0v0k', other: 'toji', atEvent: true, eventName: null, minted: false,
        };
        expect(meetShareText(info)).toMatch(/^Met toji at an event — checked in by tap/);
    });

    it('long event names are shortened to fit 280', () => {
        const info = shareInfoFromMeet(meet({
            source: 'event', tier: 'peer_verified', event: { id: 7, name: 'Very long event name '.repeat(20).trim() },
            users: [person(1, 'x'.repeat(150)), person(2, 'y'.repeat(150))],
        }), 1);
        const text = meetShareText(info);
        expect(xPostLength(text)).toBeLessThanOrEqual(X_POST_LIMIT);
        expect(text).toContain('…');
        expect(text.endsWith('https://nextvibe.io/u/meet/ef91kGQl0v0k')).toBe(true);
    });

    it('opens the X composer with the whole post', () => {
        const info = shareInfoFromMeet(meet(), 1);
        const url = meetShareIntentUrl(info);
        expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
        expect(decodeURIComponent(url.slice('https://x.com/intent/post?text='.length))).toBe(meetShareText(info));
    });

    it('links', () => {
        expect(meetPageUrl('ef91kGQl0v0k')).toBe('https://nextvibe.io/u/meet/ef91kGQl0v0k');
        expect(meetCardUrl('ef91kGQl0v0k')).toBe('https://api.nextvibe.io/api/v1/meet/ef91kGQl0v0k/card.png?v=story');
        expect(meetCardUrl('ef91kGQl0v0k', 'og', 'abc')).toBe('https://api.nextvibe.io/api/v1/meet/ef91kGQl0v0k/card.png?v=og&rev=abc');
    });

    it('reads meet links from every origin', () => {
        for (const link of [
            'https://nextvibe.io/u/meet/ef91kGQl0v0k',
            'https://www.nextvibe.io/u/meet/ef91kGQl0v0k/',
            'nextvibe://u/meet/ef91kGQl0v0k',
            '/u/meet/ef91kGQl0v0k?utm_source=x',
            'https://nextvibe.io/u/meet/ef91kGQl0v0k/card.png?v=story',
        ]) {
            expect(meetLinkSlug(link)).toBe('ef91kGQl0v0k');
        }
        for (const link of [
            'https://nextvibe.io/u/meets',
            'https://nextvibe.io/u/meet/',
            'https://nextvibe.io/u/meet/a/b',
            'https://nextvibe.io/u/meet/<script>',
            'https://nextvibe.io.evil.com/u/meet/ef91kGQl0v0k',
            'https://nextvibe.io/u/123',
        ]) {
            expect(meetLinkSlug(link)).toBeNull();
        }
        expect(isMeetsLink('https://nextvibe.io/u/meets')).toBe(true);
        expect(isMeetsLink('nextvibe://u/meets/')).toBe(true);
        expect(isMeetsLink('https://nextvibe.io/u/meet/ef91kGQl0v0k')).toBe(false);
    });
});
