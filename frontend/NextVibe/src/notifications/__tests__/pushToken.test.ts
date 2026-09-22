const mockDisk = new Map<string, string>();
const mockSecure = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockDisk.set(key, value); }),
        removeItem: jest.fn(async (key: string) => { mockDisk.delete(key); }),
    },
}));
jest.mock('@/src/utils/storage', () => ({
    storage: {
        getItem: jest.fn(async (key: string) => mockSecure.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockSecure.set(key, value); }),
    },
}));
jest.mock('axios', () => {
    const bare = { post: jest.fn() };
    return {
        __esModule: true,
        default: {
            get: jest.fn(),
            post: jest.fn(),
            create: jest.fn(() => bare),
            isAxiosError: (e: any) => !!e?.isAxiosError,
            __bare: bare,
        },
    };
});
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-notifications', () => ({
    __esModule: true,
    getPermissionsAsync: jest.fn(),
    getExpoPushTokenAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
}));
jest.mock('@/src/utils/url_api', () => ({ __esModule: true, default: () => 'https://api.test/api/v1' }));
jest.mock('@/src/utils/walletLogger', () => ({
    walletLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import axios from 'axios';
import * as Notifications from 'expo-notifications';
import { storage } from '@/src/utils/storage';
import {
    syncPushToken, syncPushTokenIfStale, releasePushToken, __resetPushTokenForTests,
    PUSH_TOKEN_CACHE_KEY, SYNC_INTERVAL_MS, STEP_TIMEOUT_MS,
} from '../pushToken';

const TOKEN = 'ExponentPushToken[device-one]';
const NEW_TOKEN = 'ExponentPushToken[after-reinstall]';
const ME = 'https://api.test/api/v1/users/me/push-token/';
const SAVE = 'https://api.test/api/v1/users/save-push-token/';
const REFRESH = 'https://api.test/api/v1/users/token/refresh/';

const http = axios as unknown as { get: jest.Mock; post: jest.Mock; __bare: { post: jest.Mock } };
const notifications = Notifications as unknown as Record<string, jest.Mock>;
const device = require('expo-device') as { isDevice: boolean };

const flush = () => new Promise((r) => setImmediate(r));

function signIn(userId = '7', access = 'access-7', refresh = 'refresh-7') {
    mockSecure.set('id', userId);
    mockSecure.set('access', access);
    mockSecure.set('refresh', refresh);
}
function serverHas(token: string | null) {
    http.get.mockResolvedValue({ data: { token } });
}
function cache() {
    const raw = mockDisk.get(PUSH_TOKEN_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
}
function savePosts() {
    return http.post.mock.calls.filter(([url]) => url === SAVE);
}

beforeEach(() => {
    jest.useRealTimers();
    mockDisk.clear();
    mockSecure.clear();
    jest.clearAllMocks();
    __resetPushTokenForTests();
    device.isDevice = true;
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN });
    http.post.mockResolvedValue({ data: { data: 'Token saved' } });
    http.__bare.post.mockResolvedValue({ data: { data: 'Token cleared' } });
    serverHas(null);
});

describe('syncPushToken', () => {
    it('fresh install, then sign-in: saves the token and caches it', async () => {
        signIn();

        await expect(syncPushToken()).resolves.toBe('synced');

        expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project' });
        expect(http.get).toHaveBeenCalledWith(ME, { timeout: STEP_TIMEOUT_MS });
        expect(savePosts()).toEqual([[SAVE, { pushToken: TOKEN }, { timeout: STEP_TIMEOUT_MS }]]);
        expect(cache()).toMatchObject({ token: TOKEN, userId: '7' });
        expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('next launch with the same token on both sides: no POST', async () => {
        signIn();
        await syncPushToken();
        http.post.mockClear();
        serverHas(TOKEN);

        await expect(syncPushToken()).resolves.toBe('unchanged');
        expect(savePosts()).toHaveLength(0);
    });

    it('reinstall: new token, empty cache, server holds the dead one → replaced', async () => {
        signIn();
        serverHas(TOKEN);
        notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: NEW_TOKEN });

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(savePosts()).toEqual([[SAVE, { pushToken: NEW_TOKEN }, expect.anything()]]);
        expect(cache()).toMatchObject({ token: NEW_TOKEN });
    });

    it('server lost the token (dead-token cleanup, other account took it): POSTs despite the cache', async () => {
        signIn();
        await syncPushToken();
        http.post.mockClear();
        serverHas(null);

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(savePosts()).toHaveLength(1);
    });

    it('server state unknown (offline read, older backend without me/push-token/): POSTs anyway', async () => {
        signIn();
        await syncPushToken();
        http.post.mockClear();
        http.get.mockRejectedValue(Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }));

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(savePosts()).toHaveLength(1);
    });

    it('another account signed in on this phone: POSTs for it', async () => {
        signIn('7');
        await syncPushToken();
        http.post.mockClear();
        signIn('8', 'access-8', 'refresh-8');
        serverHas(null);

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(cache()).toMatchObject({ token: TOKEN, userId: '8' });
    });

    it('never prompts and does nothing without permission', async () => {
        signIn();
        notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });

        await expect(syncPushToken()).resolves.toBe('no-permission');
        expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();
    });

    it('signed out: nothing', async () => {
        await expect(syncPushToken()).resolves.toBe('signed-out');
        expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    });

    it('simulator: nothing', async () => {
        signIn();
        device.isDevice = false;
        await expect(syncPushToken()).resolves.toBe('unsupported');
        expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    });

    it('sign-in wrote id but not access yet (handlers do not await): waits for it', async () => {
        mockSecure.set('id', '7');
        setTimeout(() => { mockSecure.set('access', 'access-7'); }, 300);

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(savePosts()).toHaveLength(1);
    });

    it('a hung Expo token request gives up after 5 s without blocking or POSTing', async () => {
        jest.useFakeTimers();
        signIn();
        notifications.getExpoPushTokenAsync.mockReturnValue(new Promise(() => { }));

        const result = syncPushToken();
        await jest.advanceTimersByTimeAsync(STEP_TIMEOUT_MS + 1);

        await expect(result).resolves.toBe('error');
        expect(http.post).not.toHaveBeenCalled();
    });

    it('a failed POST is not cached, so the next launch tries again', async () => {
        signIn();
        http.post.mockRejectedValueOnce(new Error('network'));

        await expect(syncPushToken()).resolves.toBe('error');
        expect(cache()).toBeNull();

        await expect(syncPushToken()).resolves.toBe('synced');
        expect(savePosts()).toHaveLength(2);
    });

    it('calls during a sync fold into one more pass', async () => {
        signIn();
        const first = syncPushToken('session');
        const second = syncPushToken('permission');
        const third = syncPushToken('foreground');

        expect(second).toBe(first);
        expect(third).toBe(first);
        await first;
        expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    });
});

describe('syncPushTokenIfStale (foreground)', () => {
    it('waits 24 h after an attempt', async () => {
        signIn();
        const start = Date.now();
        await syncPushToken();

        expect(syncPushTokenIfStale(start + SYNC_INTERVAL_MS - 60_000)).toBeNull();
        const due = syncPushTokenIfStale(Date.now() + SYNC_INTERVAL_MS + 1);
        expect(due).not.toBeNull();
        await due;
    });

    it('re-checks right away when notifications were off (maybe turned on in Settings)', async () => {
        signIn();
        notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
        await syncPushToken();

        notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
        await expect(syncPushTokenIfStale()).resolves.toBe('synced');
    });
});

describe('releasePushToken (sign-out)', () => {
    it('clears the cache and tells the server, without the app interceptors', async () => {
        signIn();
        await syncPushToken();

        await releasePushToken();
        // The caller clears the session right after; the request must not need it.
        mockSecure.clear();
        await flush();

        expect(mockDisk.has(PUSH_TOKEN_CACHE_KEY)).toBe(false);
        expect(http.__bare.post).toHaveBeenCalledWith(
            SAVE,
            { pushToken: null, releaseToken: TOKEN },
            { headers: { Authorization: 'Bearer access-7' }, timeout: STEP_TIMEOUT_MS },
        );
    });

    it('expired access token: refreshes once in memory and never writes a session back', async () => {
        signIn();
        http.__bare.post
            .mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
            .mockResolvedValueOnce({ data: { access: 'fresh-access', refresh: 'rotated' } })
            .mockResolvedValueOnce({ data: { data: 'Token cleared' } });

        await releasePushToken();
        mockSecure.clear();
        await flush();
        await flush();

        expect(http.__bare.post.mock.calls.map(([url]) => url)).toEqual([SAVE, REFRESH, SAVE]);
        expect(http.__bare.post.mock.calls[1][1]).toEqual({ refresh: 'refresh-7' });
        expect(http.__bare.post.mock.calls[2][2]).toMatchObject({ headers: { Authorization: 'Bearer fresh-access' } });
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('never cached a token: clears whatever the server has', async () => {
        signIn();
        await releasePushToken();
        await flush();
        expect(http.__bare.post).toHaveBeenCalledWith(SAVE, { pushToken: null }, expect.anything());
    });

    it('signed out already: no request', async () => {
        await releasePushToken();
        await flush();
        expect(http.__bare.post).not.toHaveBeenCalled();
    });

    it('a sync still fetching when the user signs out does not bind the token again', async () => {
        signIn();
        let resolveToken!: (v: { type: string; data: string }) => void;
        notifications.getExpoPushTokenAsync.mockReturnValue(new Promise((r) => { resolveToken = r; }));

        const inFlight = syncPushToken();
        await flush();
        await releasePushToken();
        mockSecure.clear();
        resolveToken({ type: 'expo', data: TOKEN });

        await expect(inFlight).resolves.toBe('signed-out');
        await flush();
        expect(savePosts()).toHaveLength(0);
        expect(mockDisk.has(PUSH_TOKEN_CACHE_KEY)).toBe(false);
        expect(http.__bare.post).toHaveBeenCalledTimes(1);
    });

    it('sign-out while fetching, before storage is cleared: the sync still stands down', async () => {
        signIn();
        let resolveToken!: (v: { type: string; data: string }) => void;
        notifications.getExpoPushTokenAsync.mockReturnValue(new Promise((r) => { resolveToken = r; }));

        const inFlight = syncPushToken();
        await flush();
        await releasePushToken();
        resolveToken({ type: 'expo', data: TOKEN });

        await expect(inFlight).resolves.toBe('stale');
        expect(savePosts()).toHaveLength(0);
        expect(mockDisk.has(PUSH_TOKEN_CACHE_KEY)).toBe(false);
    });

    it('a sync that already sent its POST lands before the release', async () => {
        signIn();
        let finishPost!: () => void;
        http.post.mockReturnValue(new Promise((r) => { finishPost = () => r({ data: {} }); }));

        const inFlight = syncPushToken();
        while (savePosts().length === 0) await flush();
        await releasePushToken();
        await flush();
        expect(http.__bare.post).not.toHaveBeenCalled();

        finishPost();
        await expect(inFlight).resolves.toBe('stale');
        await flush();
        expect(http.__bare.post).toHaveBeenCalledTimes(1);
        expect(mockDisk.has(PUSH_TOKEN_CACHE_KEY)).toBe(false);
    });
});
