/**
 * Keeps this phone's Expo push token registered to the signed-in account.
 *
 * - syncPushToken() runs on every launch once someone is signed in, right
 *   after any sign-in (email, Google, Apple and wallet all end with the root
 *   layout's userID set, see usePushTokenSync), and on foreground once the
 *   last attempt is 24 h old.
 * - It never prompts. The notification prompt stays in the root layout.
 * - It POSTs only when the token differs from the one cached here or the one
 *   the server has. Errors are logged and retried on the next launch.
 * - releasePushToken() on sign-out detaches the phone from the account.
 *
 * A rotated APNs/FCM token needs nothing from us: expo-notifications
 * re-registers it with Expo itself, and the Expo token stays the same. Only a
 * reinstall or another account on this phone changes what the server needs.
 */
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import { walletLogger } from '@/src/utils/walletLogger';

export const PUSH_TOKEN_CACHE_KEY = 'nv:pushToken';
/** Written by the old registration code; never read. */
const LEGACY_CACHE_KEY = 'expo_push_token';
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Per network step: Expo token, server read, server write. */
export const STEP_TIMEOUT_MS = 5000;
/** Sign-in handlers write `id` first and `access` right after, without awaiting. */
const SESSION_WAIT_MS = 2000;
const TAG = 'Push:Token';

export type SyncResult = 'synced' | 'unchanged' | 'signed-out' | 'no-permission' | 'unsupported' | 'stale' | 'error';

type Session = { userId: string; access: string; refresh: string | null };
type CachedToken = { token: string; userId: string; syncedAt: number };

let running: Promise<SyncResult> | null = null;
let queued = false;
/** Bumped on sign-out: a sync that started earlier must not bind the token again. */
let epoch = 0;
let lastAttemptAt = 0;
let lastResult: SyncResult | null = null;

// No app interceptors: after sign-out a token refresh must not write a session back.
const bare = axios.create();

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

async function readSession(waitMs = 0): Promise<Session | null> {
    const started = Date.now();
    for (;;) {
        const [userId, access, refresh] = await Promise.all([
            storage.getItem('id'),
            storage.getItem('access'),
            storage.getItem('refresh'),
        ]);
        if (!userId) return null;
        if (access) return { userId: String(userId), access, refresh: refresh ?? null };
        if (Date.now() - started >= waitMs) return null;
        await new Promise((r) => setTimeout(r, 100));
    }
}

async function readCache(): Promise<CachedToken | null> {
    try {
        const raw = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed.token === 'string' ? parsed : null;
    } catch {
        return null;
    }
}

async function clearCache(): Promise<void> {
    await Promise.all([
        AsyncStorage.removeItem(PUSH_TOKEN_CACHE_KEY),
        AsyncStorage.removeItem(LEGACY_CACHE_KEY),
    ]).catch(() => {});
}

/** The account's token on the server; undefined when unknown (offline, older backend). */
async function fetchServerToken(): Promise<string | null | undefined> {
    try {
        const res = await axios.get(`${GetApiUrl()}/users/me/push-token/`, { timeout: STEP_TIMEOUT_MS });
        const token = res.data?.token;
        return typeof token === 'string' ? token : null;
    } catch (e) {
        walletLogger.debug(TAG, 'Server token unknown; will POST', e);
        return undefined;
    }
}

async function syncOnce(reason: string): Promise<SyncResult> {
    const startedIn = epoch;
    try {
        if (!(await storage.getItem('id'))) return 'signed-out';
        if (!Device.isDevice) return 'unsupported';

        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') return 'no-permission';

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) {
            walletLogger.warn(TAG, 'No EAS projectId; cannot get a push token');
            return 'unsupported';
        }

        const { data: token } = await withTimeout(
            Notifications.getExpoPushTokenAsync({ projectId }),
            STEP_TIMEOUT_MS,
            'getExpoPushTokenAsync',
        );

        const session = await readSession(SESSION_WAIT_MS);
        if (!session) return 'signed-out';

        const [cached, serverToken] = await Promise.all([readCache(), fetchServerToken()]);
        const upToDate = cached?.token === token && cached.userId === session.userId && serverToken === token;

        if (!upToDate) {
            // Signed out (or into another account) while we were fetching.
            const current = await readSession();
            if (epoch !== startedIn || current?.userId !== session.userId) return 'stale';
            // save-push-token/ also exists on backends older than me/push-token/.
            await axios.post(`${GetApiUrl()}/users/save-push-token/`, { pushToken: token }, { timeout: STEP_TIMEOUT_MS });
        }
        if (epoch !== startedIn) return 'stale';

        const entry: CachedToken = { token, userId: session.userId, syncedAt: Date.now() };
        await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, JSON.stringify(entry));
        walletLogger.info(TAG, upToDate ? `Token unchanged (${reason})` : `Token saved (${reason})`, {
            userId: session.userId,
            server: serverToken === undefined ? 'unknown' : serverToken === token ? 'current' : serverToken ? 'other' : 'empty',
        });
        return upToDate ? 'unchanged' : 'synced';
    } catch (e) {
        walletLogger.warn(TAG, `Sync failed (${reason}); retrying next launch`, e);
        return 'error';
    }
}

/**
 * Registers this phone's push token with the signed-in account if the server
 * doesn't have it yet. Never prompts, never throws, safe to call any time:
 * calls during a sync are folded into one more pass once it finishes.
 */
export function syncPushToken(reason = 'launch'): Promise<SyncResult> {
    if (running) {
        queued = true;
        return running;
    }
    running = (async () => {
        try {
            let result: SyncResult;
            do {
                queued = false;
                lastAttemptAt = Date.now();
                result = await syncOnce(reason);
                lastResult = result;
            } while (queued);
            return result;
        } finally {
            running = null;
        }
    })();
    return running;
}

/**
 * Foreground check: syncs when the last attempt is 24 h old, or when
 * notifications were off last time (they may have been turned on in Settings).
 */
export function syncPushTokenIfStale(now = Date.now()): Promise<SyncResult> | null {
    if (running) return null;
    if (lastResult !== 'no-permission' && now - lastAttemptAt < SYNC_INTERVAL_MS) return null;
    return syncPushToken('foreground');
}

async function sendRelease(session: Session, releaseToken: string | null): Promise<void> {
    const url = `${GetApiUrl()}/users/save-push-token/`;
    const body = releaseToken ? { pushToken: null, releaseToken } : { pushToken: null };
    const post = (access: string) =>
        bare.post(url, body, { headers: { Authorization: `Bearer ${access}` }, timeout: STEP_TIMEOUT_MS });
    try {
        await post(session.access);
    } catch (e) {
        if (!axios.isAxiosError(e) || e.response?.status !== 401 || !session.refresh) throw e;
        // Access tokens last an hour. Refresh once, in memory only.
        const res = await bare.post(`${GetApiUrl()}/users/token/refresh/`, { refresh: session.refresh }, { timeout: STEP_TIMEOUT_MS });
        await post(res.data.access);
    }
}

/**
 * Sign-out: this phone stops getting the account's pushes. Call it before the
 * session is cleared. It only waits for the session read; the request runs in
 * the background and never throws.
 */
export async function releasePushToken(): Promise<void> {
    epoch += 1;
    const pendingSync = running;
    let session: Session | null = null;
    let cached: CachedToken | null = null;
    try {
        [session, cached] = await Promise.all([readSession(), readCache()]);
    } catch { }
    await clearCache();
    if (!session) return;

    const signedOut = session;
    const releaseToken = cached && cached.userId === signedOut.userId ? cached.token : null;
    void (async () => {
        try {
            // A POST that already left must land before the release.
            await pendingSync;
            await sendRelease(signedOut, releaseToken);
            walletLogger.info(TAG, 'Token released on sign-out', { userId: signedOut.userId });
        } catch (e) {
            walletLogger.warn(TAG, 'Release failed; the next account signing in here takes the token over', e);
        }
    })();
}

/** Test helper. */
export function __resetPushTokenForTests(): void {
    running = null;
    queued = false;
    epoch = 0;
    lastAttemptAt = 0;
    lastResult = null;
}
