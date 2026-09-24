import {
    intentFromNotification,
    intentFromUrl,
    intentSignature,
    isBootstrapPath,
    isUnknownUPath,
    pickNavigationMethod,
    splitHref,
    MEET_KIND,
    MEET_PHOTO_KIND,
    MEETS_KIND,
    PROFILE_PATH,
    TAP_KIND,
    TAP_PATH,
    COLLECTIBLES_KIND,
    COLLECTIBLES_OPEN_PARAM,
    WALLET_KIND,
    WALLET_PATH,
} from '../intents';

const NOW = 1_700_000_000_000;

describe('intentFromNotification', () => {
    it('a Proof of Meet photo push opens the photo sheet for its meet; older builds follow its url', () => {
        const data = { type: 'meet_photo', slug: 'ef91kGQl0v0k', status: 'pending', url: 'https://nextvibe.io/u/meet/ef91kGQl0v0k' };
        expect(intentFromNotification(data, 'n9', NOW).intent).toEqual({
            id: 'push:n9', path: '/u/meet/ef91kGQl0v0k', params: { slug: 'ef91kGQl0v0k' }, source: 'push',
            kind: MEET_PHOTO_KIND, createdAt: NOW,
        });
        // A bad slug falls back to the url (the plain meet sheet)
        expect(intentFromNotification({ ...data, slug: '../x' }, 'n10', NOW).intent?.kind).toBe(MEET_KIND);
    });

    it('seeker_verified opens the own profile with the sheet, whatever url the console attached', () => {
        const plain = intentFromNotification({ type: 'seeker_verified' }, 'n1', NOW);
        expect(plain.intent).toEqual({
            id: 'push:n1', path: PROFILE_PATH, params: { open: 'seeker' }, source: 'push', kind: 'seeker_verified', createdAt: NOW,
        });
        const withUrl = intentFromNotification({ type: 'seeker_verified', url: '/profile', deeplink: 'nextvibe://profile' }, 'n2', NOW);
        expect(withUrl.intent?.path).toBe(PROFILE_PATH);
        expect(withUrl.intent?.params).toEqual({ open: 'seeker' });
    });

    it('data.url becomes path + params, with /profile normalised to the tabs route', () => {
        expect(intentFromNotification({ url: '/profile?open=seeker' }, 'n', NOW).intent).toMatchObject({
            path: PROFILE_PATH, params: { open: 'seeker' }, kind: 'url',
        });
        expect(intentFromNotification({ url: '/(shared)/chat-room?id=42' }, 'n', NOW).intent).toMatchObject({
            path: '/(shared)/chat-room', params: { id: '42' },
        });
        expect(intentFromNotification({ url: '/post-details?id=7', type: 'announcement' }, 'n', NOW).intent).toMatchObject({
            path: '/post-details', params: { id: '7' }, kind: 'announcement',
        });
    });

    it('external_url is never an intent', () => {
        const r = intentFromNotification({ external_url: 'https://x.com/nextvibe', type: 'announcement' }, 'n', NOW);
        expect(r.intent).toBeUndefined();
        expect(r.external).toBe('https://x.com/nextvibe');
    });

    it('keeps the old data.type table', () => {
        expect(intentFromNotification({ type: 'new_follower', user_id: 5 }, 'n', NOW).intent).toMatchObject({ path: '/user-profile', params: { id: '5' } });
        expect(intentFromNotification({ type: 'new_like', post_id: 9 }, 'n', NOW).intent).toMatchObject({ path: '/post-details', params: { id: '9' } });
        expect(intentFromNotification({ type: 'new_comment', post_id: 9 }, 'n', NOW).intent).toMatchObject({ path: '/post-details', params: { id: '9' } });
        expect(intentFromNotification({ type: 'chat_message', chat_id: 3 }, 'n', NOW).intent).toMatchObject({ path: '/(shared)/chat-room', params: { id: '3' } });
        expect(intentFromNotification({ type: 'new_message', chat_id: 3 }, 'n', NOW).intent).toMatchObject({ path: '/(shared)/chat-room', params: { id: '3' } });
        expect(intentFromNotification({ type: 'cherry_chat' }, 'n', NOW).intent).toMatchObject({ path: '/(shared)/cherry-chat' });
        expect(intentFromNotification({ type: 'new_follower' }, 'n', NOW).intent).toBeUndefined();
        expect(intentFromNotification({ type: 'announcement' }, 'n', NOW).intent).toBeUndefined();
        expect(intentFromNotification(null, 'n', NOW)).toEqual({});
    });
});

describe('intentFromUrl', () => {
    it('matches own-profile links on the scheme and the site', () => {
        for (const url of ['nextvibe://profile?open=seeker', 'nextvibe:///profile?open=seeker', 'https://nextvibe.io/profile?open=seeker', 'nextvibe.io/profile/?open=seeker']) {
            const intent = intentFromUrl(url, true, NOW);
            expect(intent).toMatchObject({ path: PROFILE_PATH, params: { open: 'seeker' }, source: 'link', kind: 'seeker_verified' });
        }
        expect(intentFromUrl('nextvibe://profile', true, NOW)).toMatchObject({ path: PROFILE_PATH, params: {}, kind: 'profile-link' });
    });

    it('leaves other links alone', () => {
        expect(intentFromUrl('nextvibe://profile/alice', true, NOW)).toBeNull();
        expect(intentFromUrl('https://nextvibe.io/u/verified/alice', true, NOW)).toBeNull();
        expect(intentFromUrl('nextvibe://wallet-redirect?data=x&nonce=y', false, NOW)).toBeNull();
        expect(intentFromUrl('https://nextvibe.io/u/e?t=abcd1234', true, NOW)).toBeNull();
        expect(intentFromUrl('https://nextvibe.io/u/12', true, NOW)).toBeNull();
        expect(intentFromUrl('https://evil.com/profile?open=seeker', true, NOW)).toBeNull();
        expect(intentFromUrl('https://nextvibe.io.evil.com/profile?open=seeker', true, NOW)).toBeNull();
    });

    it('gives every delivery its own id (the store dedups by signature)', () => {
        const a = intentFromUrl('nextvibe://profile?open=seeker', true, NOW)!;
        const b = intentFromUrl('nextvibe://profile?open=seeker', false, NOW + 1)!;
        expect(a.id).not.toBe(b.id);
        expect(intentSignature(a)).toBe(intentSignature(b));
        expect(intentSignature({ path: '/x', params: { b: '2', a: '1' } })).toBe('/x?a=1&b=2');
    });
});

describe('Proof of Meet links', () => {
    it('a meet link on any origin becomes a meet-sheet intent', () => {
        for (const url of [
            'https://nextvibe.io/u/meet/ef91kGQl0v0k',
            'https://www.nextvibe.io/u/meet/ef91kGQl0v0k/?ref=x',
            'nextvibe://u/meet/ef91kGQl0v0k',
            'https://nextvibe.io/u/meet/ef91kGQl0v0k/card.png',
        ]) {
            expect(intentFromUrl(url, true, NOW)).toMatchObject({
                path: '/u/meet/ef91kGQl0v0k', params: { slug: 'ef91kGQl0v0k' }, source: 'link', kind: MEET_KIND, createdAt: NOW,
            });
        }
    });

    it('/u/meets opens the own profile with POAPs & History', () => {
        expect(intentFromUrl('https://nextvibe.io/u/meets', false, NOW)).toMatchObject({
            path: PROFILE_PATH, params: { open: 'meets' }, source: 'link', kind: MEETS_KIND,
        });
    });

    it('the "cards are ready" push and meet pushes use the same intents', () => {
        // nv sends nextvibe.io/u/... links as the in-app path
        expect(intentFromNotification({ type: 'meet_cards_ready', url: '/u/meets', deeplink: 'https://nextvibe.io/u/meets' }, 'n9', NOW).intent)
            .toEqual({ id: 'push:n9', path: PROFILE_PATH, params: { open: 'meets' }, source: 'push', kind: MEETS_KIND, createdAt: NOW });
        expect(intentFromNotification({ url: '/u/meet/ef91kGQl0v0k' }, 'n10', NOW).intent)
            .toMatchObject({ path: '/u/meet/ef91kGQl0v0k', params: { slug: 'ef91kGQl0v0k' }, kind: MEET_KIND, source: 'push' });
    });

    it('/u/tap opens Tap to Meet (the first-tap email), with home underneath from a cold start', () => {
        for (const url of ['https://nextvibe.io/u/tap', 'https://www.nextvibe.io/u/tap/?utm_source=email', 'nextvibe://u/tap']) {
            expect(intentFromUrl(url, true, NOW)).toMatchObject({
                path: TAP_PATH, params: { mode: 'irl' }, source: 'link', kind: TAP_KIND, createdAt: NOW,
            });
        }
        expect(TAP_PATH).toBe('/event-nfc-share');
        expect(intentFromNotification({ url: '/u/tap', deeplink: 'https://nextvibe.io/u/tap' }, 'n11', NOW).intent)
            .toEqual({ id: 'push:n11', path: TAP_PATH, params: { mode: 'irl' }, source: 'push', kind: TAP_KIND, createdAt: NOW });
        expect(pickNavigationMethod('/splash', undefined, { path: TAP_PATH })).toBe('homeThenPush');
        expect(pickNavigationMethod('/home', '(tabs)', { path: TAP_PATH })).toBe('push');
        expect(intentFromUrl('https://nextvibe.io/u/tap/more', true, NOW)).toBeNull();
    });

    it('two deliveries of one meet link are one intent', () => {
        const a = intentFromUrl('https://nextvibe.io/u/meet/ef91kGQl0v0k', true, NOW)!;
        const b = intentFromUrl('nextvibe.io/u/meet/ef91kGQl0v0k', false, NOW + 5)!;
        expect(intentSignature(a)).toBe(intentSignature(b));
    });

    it('a broken meet link is no intent', () => {
        expect(intentFromUrl('https://nextvibe.io/u/meet/', true, NOW)).toBeNull();
        expect(intentFromUrl('https://nextvibe.io/u/meet/a/b', true, NOW)).toBeNull();
    });
});

describe('isUnknownUPath', () => {
    it('knows every /u screen', () => {
        for (const url of [
            'https://nextvibe.io/u/12',
            'https://nextvibe.io/u/e?t=abcd1234',
            'https://nextvibe.io/u/post/7',
            'https://nextvibe.io/u/verified/alice',
            'https://nextvibe.io/u/meet/ef91kGQl0v0k',
            'https://nextvibe.io/u/meets',
            'https://nextvibe.io/u/tap',
            'https://nextvibe.io/u/send?amount=1&token=SOL',
            'nextvibe://profile',
            'https://nextvibe.io/transaction?id=1',
            'https://example.com/u/whatever',
        ]) {
            expect(isUnknownUPath(url)).toBe(false);
        }
    });

    it('sends anything else under /u home', () => {
        for (const url of ['https://nextvibe.io/u', 'https://nextvibe.io/u/badges/x', 'https://nextvibe.io/u/alice', 'nextvibe://u/new-thing']) {
            expect(isUnknownUPath(url)).toBe(true);
        }
    });
});

describe('helpers', () => {
    it('splitHref decodes params and trims trailing slashes', () => {
        expect(splitHref('/post-details/?id=1&x=a%20b')).toEqual({ path: '/post-details', params: { id: '1', x: 'a b' } });
        expect(splitHref('/')).toEqual({ path: '/', params: {} });
    });

    it('isBootstrapPath', () => {
        expect(isBootstrapPath('/splash')).toBe(true);
        expect(isBootstrapPath('/register')).toBe(true);
        expect(isBootstrapPath(undefined)).toBe(true);
        expect(isBootstrapPath('/home')).toBe(false);
        expect(isBootstrapPath('/profile')).toBe(false);
    });
});

describe('pickNavigationMethod', () => {
    const profile = { path: PROFILE_PATH };
    const post = { path: '/post-details' };
    it('replaces the start flow so no splash is left underneath', () => {
        expect(pickNavigationMethod('/splash', '(shared)', profile)).toBe('replace');
        expect(pickNavigationMethod('/eas-update', '(shared)', post)).toBe('homeThenPush');
        expect(pickNavigationMethod('/splash', '(shared)', post)).toBe('homeThenPush');
        expect(pickNavigationMethod('/login', '(shared)', profile)).toBe('replace');
        expect(pickNavigationMethod('/', undefined, profile)).toBe('replace');
    });
    it('switches tab in place when the tabs are on top, pops back to them otherwise', () => {
        expect(pickNavigationMethod('/home', '(tabs)', profile)).toBe('navigate');
        expect(pickNavigationMethod('/profile', '(tabs)', profile)).toBe('navigate');
        expect(pickNavigationMethod('/post-details', '(shared)', profile)).toBe('dismissTo');
    });
    it('pushes shared screens', () => {
        expect(pickNavigationMethod('/home', '(tabs)', post)).toBe('push');
        expect(pickNavigationMethod('/chat-room', '(shared)', post)).toBe('push');
    });
});

describe('collectibles links', () => {
    it('nextvibe.io/u/collectibles opens the own profile on its cNFT tab', () => {
        for (const url of ['https://nextvibe.io/u/collectibles', 'nextvibe://u/collectibles']) {
            expect(intentFromUrl(url, false, NOW)).toMatchObject({
                path: PROFILE_PATH, params: { open: COLLECTIBLES_OPEN_PARAM }, kind: COLLECTIBLES_KIND, source: 'link',
            });
        }
        // The "now on Solana" push
        expect(intentFromNotification({ type: 'collectibles_minted', url: '/u/collectibles', count: 7 }, 'n', NOW).intent)
            .toMatchObject({ path: PROFILE_PATH, params: { open: COLLECTIBLES_OPEN_PARAM }, kind: COLLECTIBLES_KIND, source: 'push' });
    });

    it('nextvibe.io/u/wallet opens the connect sheet (no screen of its own)', () => {
        expect(intentFromUrl('https://nextvibe.io/u/wallet', true, NOW)).toMatchObject({
            path: WALLET_PATH, kind: WALLET_KIND, source: 'link',
        });
        expect(intentFromNotification({ type: 'wallet_reminder', url: '/u/wallet', step: '24h' }, 'n', NOW).intent)
            .toMatchObject({ path: WALLET_PATH, kind: WALLET_KIND, source: 'push' });
    });

    it('both are known /u/ paths (never "Unmatched Route" or home)', () => {
        expect(isUnknownUPath('https://nextvibe.io/u/collectibles')).toBe(false);
        expect(isUnknownUPath('https://nextvibe.io/u/wallet')).toBe(false);
        expect(isUnknownUPath('https://nextvibe.io/u/wallets')).toBe(true);
    });
});
