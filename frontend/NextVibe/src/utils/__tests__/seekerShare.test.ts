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
            'https://nextvibe.io/v/alice',
        );
    });

    it("doesn't claim an on-chain token check for .skr-verified accounts", () => {
        const text = seekerShareText('vibes.skr', 'skr');
        expect(text).not.toContain('Genesis Token');
        expect(text).toContain('Seeker ID (.skr) confirmed.');
        expect(text).toContain('https://nextvibe.io/v/vibes.skr');
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
        expect(xPostLength('hi https://nextvibe.io/v/' + 'x'.repeat(150))).toBe(3 + 23);
    });

    it('escapes usernames like the backend does', () => {
        expect(seekerSharePageUrl('vibes.skr')).toBe('https://nextvibe.io/v/vibes.skr');
        expect(seekerSharePageUrl("o'brien (1)")).toBe('https://nextvibe.io/v/o%27brien%20%281%29');
        expect(seekerSharePageUrl('a/b')).toBe('https://nextvibe.io/v/a%2Fb');
        expect(seekerSharePageUrl('іван')).toBe('https://nextvibe.io/v/%D1%96%D0%B2%D0%B0%D0%BD');
        expect(seekerCardUrl('vibes.skr')).toBe('https://api.nextvibe.io/api/v1/users/vibes.skr/seeker-card.png');
    });

    it('routes username links to the lookup screen', () => {
        expect(seekerLinkPath('nextvibe://profile/alice')).toBe('/v/alice');
        expect(seekerLinkPath('nextvibe://profile/vibes.skr/')).toBe('/v/vibes.skr');
        expect(seekerLinkPath('https://nextvibe.io/v/alice')).toBe('/v/alice');
        expect(seekerLinkPath('https://www.nextvibe.io/v/%D1%96%D0%B2%D0%B0%D0%BD?ref=x')).toBe('/v/%D1%96%D0%B2%D0%B0%D0%BD');
        expect(seekerLinkPath('/v/a%2Fb')).toBe('/v/a%2Fb');
    });

    it('leaves every other link alone', () => {
        expect(seekerLinkPath('nextvibe://profile')).toBeNull();
        expect(seekerLinkPath('nextvibe://profile/')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/12')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io/u/e?t=abcd1234')).toBeNull();
        expect(seekerLinkPath('https://nextvibe.io.evil.com/v/alice')).toBeNull();
        expect(seekerLinkPath('https://example.com/v/alice')).toBeNull();
        expect(seekerLinkPath('nextvibe://wallet-redirect?x=1')).toBeNull();
    });
});
