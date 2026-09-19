import { intentFromNotification, intentFromUrl, intentSignature, isBootstrapPath, pickNavigationMethod, splitHref, PROFILE_PATH } from '../intents';

const NOW = 1_700_000_000_000;

describe('intentFromNotification', () => {
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
