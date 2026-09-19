import {
    seekerCardUrl,
    seekerLinkPath,
    seekerShareIntentUrl,
    seekerSharePageUrl,
    seekerShareText,
    xPostLength,
    X_POST_LIMIT,
} from '../seekerShare';

describe('seekerShare', () => {
    it('builds the post exactly as specified', () => {
        expect(seekerShareText('alice', 'onchain')).toBe(
            "I'm Seeker Verified on @NextVibeWeb3 — Genesis Token confirmed on-chain.\n" +
            'Tap phones. Prove you met.\n' +
            'https://nextvibe.io/u/verified/alice',
        );
    });

    it("doesn't claim an on-chain token check for .skr-verified accounts", () => {
        const text = seekerShareText('vibes.skr', 'skr');
        expect(text).not.toContain('Genesis Token');
        expect(text).toContain('Seeker ID (.skr) confirmed.');
        expect(text).toContain('https://nextvibe.io/u/verified/vibes.skr');
    });

    it('opens the X composer with the whole post, newlines included', () => {
        const url = seekerShareIntentUrl('alice', 'onchain');
        expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
        const text = decodeURIComponent(url.slice('https://x.com/intent/post?text='.length));
        expect(text).toBe(seekerShareText('alice', 'onchain'));
        expect(url).not.toMatch(/[\n @—]/);
    });

    it('stays under 280 characters even for the longest username', () => {
        for (const username of ['a', 'x'.repeat(150), 'і'.repeat(150), 'vibes.skr']) {
            for (const source of ['onchain', 'skr', null]) {
                expect(xPostLength(seekerShareText(username, source))).toBeLessThan(X_POST_LIMIT);
            }
        }
        expect(xPostLength('hi https://nextvibe.io/u/verified/' + 'x'.repeat(150))).toBe(3 + 23);
    });

    it('escapes usernames like the backend does', () => {
        expect(seekerSharePageUrl('vibes.skr')).toBe('https://nextvibe.io/u/verified/vibes.skr');
        expect(seekerSharePageUrl("o'brien (1)")).toBe('https://nextvibe.io/u/verified/o%27brien%20%281%29');
        expect(seekerSharePageUrl('a/b')).toBe('https://nextvibe.io/u/verified/a%2Fb');
        expect(seekerSharePageUrl('іван')).toBe('https://nextvibe.io/u/verified/%D1%96%D0%B2%D0%B0%D0%BD');
        expect(seekerCardUrl('vibes.skr')).toBe('https://api.nextvibe.io/api/v1/users/vibes.skr/seeker-card.png');
    });

    it('routes username links to the lookup screen', () => {
        expect(seekerLinkPath('https://nextvibe.io/u/verified/alice')).toBe('/u/verified/alice');
        expect(seekerLinkPath('https://www.nextvibe.io/u/verified/%D1%96%D0%B2%D0%B0%D0%BD?ref=x')).toBe('/u/verified/%D1%96%D0%B2%D0%B0%D0%BD');
        expect(seekerLinkPath('nextvibe://profile/alice')).toBe('/u/verified/alice');
        expect(seekerLinkPath('nextvibe://profile/vibes.skr/')).toBe('/u/verified/vibes.skr');
        expect(seekerLinkPath('/u/verified/a%2Fb')).toBe('/u/verified/a%2Fb');
        // The first test links used /v/
        expect(seekerLinkPath('https://nextvibe.io/v/alice')).toBe('/u/verified/alice');
    });

    it('leaves every other link alone', () => {
        expect(seekerLinkPath('nextvibe://profile')).toBeNull();
        expect(seekerLinkPath('nextvibe://profile/')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/12')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/post/7')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/verified')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/e?t=abcd1234')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io.evil.com/v/alice')).toBeNull();
        expect(seekerLinkPath('https://example.com/v/alice')).toBeNull();
        expect(seekerLinkPath('nextvibe://wallet-redirect?x=1')).toBeNull();
    });
});
