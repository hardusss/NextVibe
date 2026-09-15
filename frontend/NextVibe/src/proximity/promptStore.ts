/**
 * The receiving side of every tap, whatever carried it (Bluetooth discovery,
 * an NFC tag read by the OS, or a tapped link). One state machine, one UI
 * (components/Proximity/ProximityPrompt) — previously BLE showed a modal and
 * NFC opened two full screens, with different copy and failure handling.
 *
 *   handle(url) → loading → confirm → connecting → success
 *                     ↘ error ↙            ↘ error
 *
 * Nothing is granted for a meet until the person presses Confirm. Check-in
 * tokens are the exception: the backend checks the scanner in on the first
 * verify call, so those skip the confirm step and open the check-in screen.
 */
import { create } from 'zustand';
import { previewProximityToken, verifyProximityToken, type VerifyTokenResponse } from '@/src/api/proximity.token';
import getUserDetail from '@/src/api/user.detail';
import { storage } from '@/src/utils/storage';
import haptics from '@/src/utils/haptics';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import { describeProximityError, ProximityClientError, type ProximityErrorInfo } from './errors';
import { getQuickLocation } from './location';
import { parseProximityPayload, payloadKey, type ProximityPayload } from './payload';

export type ProximitySource = 'ble' | 'nfc' | 'link';
export type PromptPhase = 'loading' | 'confirm' | 'connecting' | 'success' | 'error';
export type PromptKind = 'meet' | 'profile' | 'post' | 'payment';

export interface PromptPeer {
    user_id?: number;
    username?: string;
    avatar?: string | null;
    is_official?: boolean;
    is_seeker_verified?: boolean;
}

export interface PendingNavigation {
    pathname: string;
    params?: Record<string, string>;
}

interface PromptState {
    visible: boolean;
    phase: PromptPhase;
    kind: PromptKind;
    source: ProximitySource;
    payload: ProximityPayload | null;
    mode: 'irl' | 'networking' | null;
    peer: PromptPeer | null;
    points: number;
    error: ProximityErrorInfo | null;
    errorStage: 'preview' | 'confirm' | null;
    /** Navigation the host performs once the router is ready (not on splash). */
    navigation: PendingNavigation | null;
    /** Last successful meet, from this prompt or reported by a share screen. */
    lastMet: { userId: number | null; at: number } | null;

    handle: (rawUrl: string, source: ProximitySource) => boolean;
    confirm: () => Promise<void>;
    retry: () => void;
    close: () => void;
    takeNavigation: () => PendingNavigation | null;
    reportMet: (userId: number | null) => void;
}

// ── Dedup ──
// Keyed by token (or path). The value is "ignore until". While a prompt is
// being handled the key is blocked; when it closes the window depends on how
// it ended, so a failed tap can be retried right away while a declined one
// doesn't pop up again the instant phones touch.
const PROCESSING_MS = 120_000;
const AFTER_DECLINE_MS = 30_000;
const AFTER_SUCCESS_MS = 10 * 60_000;
const AFTER_RETRYABLE_ERROR_MS = 2_000;
const AFTER_FINAL_ERROR_MS = 30_000;
// Tokens rotate while two people stand together; once they met, new tokens
// from the same person are dropped silently instead of prompting again.
const RECENTLY_MET_MS = 10 * 60_000;
// Don't flash the sheet for lookups that resolve almost instantly.
const SHOW_LOADING_AFTER_MS = 250;

const blockedUntil = new Map<string, number>();
const recentlyMet = new Map<number, number>();
let currentKey: string | null = null;
let runId = 0;
let loadingTimer: ReturnType<typeof setTimeout> | null = null;

function isBlocked(key: string): boolean {
    const now = Date.now();
    for (const [k, until] of blockedUntil) {
        if (until <= now) blockedUntil.delete(k);
    }
    return (blockedUntil.get(key) ?? 0) > now;
}

function block(key: string | null, ms: number) {
    if (key) blockedUntil.set(key, Date.now() + ms);
}

function metRecently(userId?: number | null): boolean {
    if (!userId) return false;
    const at = recentlyMet.get(userId);
    return !!at && Date.now() - at < RECENTLY_MET_MS;
}

function clearLoadingTimer() {
    if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
    }
}

const INITIAL = {
    visible: false,
    phase: 'loading' as PromptPhase,
    kind: 'meet' as PromptKind,
    source: 'ble' as ProximitySource,
    payload: null,
    mode: null,
    peer: null,
    points: 0,
    error: null,
    errorStage: null,
};

export const useProximityPrompt = create<PromptState>((set, get) => {
    // A tap in flight, or a result the person is still looking at, is never
    // replaced by the next phone that happens to come close.
    const isBusy = () => {
        const { phase, visible } = get();
        if (visible) return true;
        return currentKey !== null && (phase === 'loading' || phase === 'confirm' || phase === 'connecting');
    };

    const showError = (err: unknown, stage: 'preview' | 'confirm', myRun: number) => {
        if (myRun !== runId) return;
        clearLoadingTimer();
        const error = describeProximityError(err, stage);
        walletLogger.warn(WalletTag.PROXIMITY, 'Tap failed', { stage, kind: error.kind });
        if (error.kind === 'alreadyMet') {
            const peerId = get().peer?.user_id;
            if (peerId) recentlyMet.set(peerId, Date.now());
        }
        set({ visible: true, phase: 'error', error, errorStage: stage });
        haptics.notification(error.tone === 'info' ? 'warning' : 'error');
    };

    const previewToken = async (token: string, myRun: number) => {
        if (!(await storage.getItem('access'))) {
            throw { response: { status: 401, data: {} } };
        }

        // Coordinates only if we can get them without a prompt: networking
        // and IRL previews don't need them. Check-in with a geofence does —
        // that answer comes back as locationRequired and we retry below.
        const quick = await getQuickLocation({ request: false, timeoutMs: 2500 });
        if (myRun !== runId) return null;
        const coords = quick.status === 'ok' ? quick : null;

        try {
            return await previewProximityToken(token, coords?.latitude, coords?.longitude);
        } catch (err) {
            const info = describeProximityError(err, 'checkin');
            if (info.kind !== 'locationRequired' || coords) throw err;
            const loc = await getQuickLocation({ request: true, timeoutMs: 8000 });
            if (myRun !== runId) return null;
            if (loc.status === 'denied') throw new ProximityClientError('locationDenied');
            if (loc.status === 'servicesOff') throw new ProximityClientError('locationServicesOff');
            if (loc.status === 'mocked') throw new ProximityClientError('mockLocation');
            if (loc.status !== 'ok') throw err;
            return await previewProximityToken(token, loc.latitude, loc.longitude);
        }
    };

    const applyPreview = (result: VerifyTokenResponse, myRun: number) => {
        if (myRun !== runId) return;
        clearLoadingTimer();

        if (result.interaction_type === 'checkin') {
            // Already recorded server-side — hand over to the check-in screen.
            const verified = !!result.verified;
            haptics.notification(verified ? 'success' : 'error');
            block(currentKey, AFTER_SUCCESS_MS);
            currentKey = null;
            set({
                ...INITIAL,
                navigation: {
                    pathname: '/event-checkin',
                    params: {
                        _verified: verified ? '1' : '0',
                        _post_id: result.post_id ? String(result.post_id) : '',
                        _post_name: result.post_name || '',
                        _message: result.message || '',
                        _post_image: result.post_image || '',
                    },
                },
            });
            return;
        }

        const peer = result.scanned_user ?? null;
        if (metRecently(peer?.user_id)) {
            // Same person, rotated token, already met — stay quiet.
            block(currentKey, AFTER_SUCCESS_MS);
            currentKey = null;
            set({ ...INITIAL });
            return;
        }

        const mode = result.interaction_type === 'irl' || result.source === 'irl' ? 'irl' : 'networking';
        haptics.impact('rigid');
        set({
            visible: true,
            phase: 'confirm',
            kind: 'meet',
            mode,
            peer,
            points: result.earned_points || 0,
            error: null,
            errorStage: null,
        });
    };

    const runPreview = async (payload: ProximityPayload, myRun: number) => {
        try {
            if (payload.kind === 'token') {
                const result = await previewToken(payload.token, myRun);
                if (result) applyPreview(result, myRun);
                return;
            }
            if (payload.kind === 'profile') {
                const user: any = await getUserDetail(payload.userId);
                if (myRun !== runId) return;
                clearLoadingTimer();
                haptics.impact('rigid');
                set({
                    visible: true,
                    phase: 'confirm',
                    kind: 'profile',
                    peer: {
                        user_id: payload.userId,
                        username: user?.username,
                        avatar: user?.avatar || user?.avatar_url || null,
                        is_official: !!user?.official,
                        is_seeker_verified: !!user?.seeker_verified,
                    },
                });
                return;
            }
        } catch (err) {
            showError(err, 'preview', myRun);
        }
    };

    return {
        ...INITIAL,
        navigation: null,
        lastMet: null,

        handle: (rawUrl, source) => {
            const payload = parseProximityPayload(rawUrl);
            if (payload.kind === 'unknown') return false;

            const key = payloadKey(rawUrl, payload);
            if (isBlocked(key)) return false;
            if (isBusy()) return false;

            // Old installs' formats open their original screens.
            if (payload.kind === 'legacy') {
                block(key, AFTER_DECLINE_MS);
                set({ navigation: { pathname: payload.path } });
                return true;
            }

            const myRun = ++runId;
            currentKey = key;
            block(key, PROCESSING_MS);
            clearLoadingTimer();
            walletLogger.info(WalletTag.PROXIMITY, 'Tap received', { source, kind: payload.kind });

            if (payload.kind === 'post' || payload.kind === 'payment') {
                haptics.impact('rigid');
                set({
                    ...INITIAL,
                    visible: true,
                    phase: 'confirm',
                    kind: payload.kind,
                    source,
                    payload,
                });
                return true;
            }

            set({
                ...INITIAL,
                visible: false,
                phase: 'loading',
                kind: payload.kind === 'profile' ? 'profile' : 'meet',
                source,
                payload,
            });
            loadingTimer = setTimeout(() => {
                loadingTimer = null;
                if (myRun === runId && get().phase === 'loading') {
                    haptics.impact('light');
                    set({ visible: true });
                }
            }, SHOW_LOADING_AFTER_MS);

            runPreview(payload, myRun);
            return true;
        },

        confirm: async () => {
            const { payload, kind, mode, phase } = get();
            if (!payload || (phase !== 'confirm' && phase !== 'error')) return;

            if (kind === 'profile' && payload.kind === 'profile') {
                set({ navigation: { pathname: `/u/${payload.userId}` } });
                block(currentKey, AFTER_SUCCESS_MS);
                currentKey = null;
                set({ ...INITIAL });
                return;
            }
            if ((kind === 'payment' && payload.kind === 'payment') || (kind === 'post' && payload.kind === 'post')) {
                const pathname = payload.kind === 'payment' ? payload.path : `/u/post/${payload.postId}`;
                set({ navigation: { pathname } });
                block(currentKey, AFTER_SUCCESS_MS);
                currentKey = null;
                set({ ...INITIAL });
                return;
            }
            if (payload.kind !== 'token') return;

            const myRun = ++runId;
            set({ phase: 'connecting', error: null, errorStage: null });
            try {
                let latitude: number | undefined;
                let longitude: number | undefined;
                if (mode === 'networking') {
                    // Event networking is geofenced: coordinates are required.
                    const loc = await getQuickLocation({ request: true, timeoutMs: 8000 });
                    if (myRun !== runId) return;
                    if (loc.status === 'denied') throw new ProximityClientError('locationDenied');
                    if (loc.status === 'servicesOff') throw new ProximityClientError('locationServicesOff');
                    if (loc.status === 'mocked') throw new ProximityClientError('mockLocation');
                    if (loc.status === 'ok') {
                        latitude = loc.latitude;
                        longitude = loc.longitude;
                    }
                } else {
                    // IRL taps have no geofence — attach a fix only if it's instant.
                    const loc = await getQuickLocation({ request: false, timeoutMs: 1500 });
                    if (myRun !== runId) return;
                    if (loc.status === 'ok') {
                        latitude = loc.latitude;
                        longitude = loc.longitude;
                    }
                }

                const result = await verifyProximityToken(payload.token, latitude, longitude);
                if (myRun !== runId) return;
                if (!result.success) {
                    throw { response: { status: 400, data: result } };
                }
                const peer = result.scanned_user ?? get().peer;
                if (peer?.user_id) recentlyMet.set(peer.user_id, Date.now());
                block(currentKey, AFTER_SUCCESS_MS);
                haptics.notification('success');
                set({
                    phase: 'success',
                    peer,
                    points: result.earned_points ?? get().points,
                    mode: result.source === 'irl' || result.interaction_type === 'irl' ? 'irl' : get().mode,
                    lastMet: { userId: peer?.user_id ?? null, at: Date.now() },
                });
            } catch (err) {
                showError(err, 'confirm', myRun);
            }
        },

        retry: () => {
            const { payload, errorStage } = get();
            if (!payload) return;
            if (errorStage === 'confirm') {
                get().confirm();
                return;
            }
            const myRun = ++runId;
            set({ phase: 'loading', error: null, errorStage: null, visible: true });
            runPreview(payload, myRun);
        },

        close: () => {
            const { phase, error } = get();
            runId++;
            clearLoadingTimer();
            if (phase === 'success') block(currentKey, AFTER_SUCCESS_MS);
            else if (phase === 'error') block(currentKey, error?.retryable ? AFTER_RETRYABLE_ERROR_MS : AFTER_FINAL_ERROR_MS);
            else block(currentKey, AFTER_DECLINE_MS);
            currentKey = null;
            set({ visible: false, phase: 'loading', error: null, errorStage: null });
        },

        takeNavigation: () => {
            const nav = get().navigation;
            if (nav) set({ navigation: null });
            return nav;
        },

        reportMet: (userId) => {
            if (userId) recentlyMet.set(userId, Date.now());
            set({ lastMet: { userId, at: Date.now() } });
            // Symmetric tap: the other person confirmed first. If this phone is
            // still asking "Meet them?", there's nothing left to confirm.
            const { visible, phase, peer } = get();
            if (visible && userId && peer?.user_id === userId && (phase === 'confirm' || phase === 'loading')) {
                runId++;
                block(currentKey, AFTER_SUCCESS_MS);
                currentKey = null;
                set({ visible: false, phase: 'loading' });
            }
        },
    };
});
