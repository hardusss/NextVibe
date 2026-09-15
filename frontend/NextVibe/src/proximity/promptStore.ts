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
    /** A Tap to Meet screen is open (it shows its own success screen). */
    setShareScreenActive: (active: boolean) => void;
}

// ── Dedup ──
// Keyed by token (or path). The value is "ignore until". While a prompt is
// being handled the key is blocked; when it closes the window depends on how
// it ended, so a failed tap can be retried while a declined one doesn't pop
// up again the instant phones touch.
const PROCESSING_MS = 120_000;
const AFTER_DECLINE_MS = 30_000;
// A token lives 300s server-side; nothing about it changes after a result.
const TOKEN_LIFETIME_MS = 5 * 60_000;
const AFTER_SUCCESS_MS = 10 * 60_000;
// Bluetooth keeps re-reading a phone that stays next to this one, so a closed
// error from Bluetooth stays quiet longer than one from a deliberate NFC/link tap.
const AFTER_RETRYABLE_ERROR_MS = { ble: 15_000, nfc: 2_000, link: 2_000 } as const;
const AFTER_FINAL_ERROR_MS = 30_000;
// Tokens rotate while two people stand together. Remember people, not tokens:
const RECENTLY_MET_MS = 10 * 60_000;
const DECLINED_PERSON_MS = 90_000;
// The organizer's code rotates too; one check-in screen per event is enough.
const RECENT_CHECKIN_MS = 10 * 60_000;
// "You've already met" is worth saying once, not after every rotation.
const ALREADY_MET_NOTICE_MS = 10 * 60_000;
// Don't flash the sheet for lookups that resolve almost instantly.
const SHOW_LOADING_AFTER_MS = 250;
// Safety net: a flow that hasn't moved for this long (e.g. the sheet could
// not be presented) must not block every future tap.
const STUCK_AFTER_MS = 3 * 60_000;

const blockedUntil = new Map<string, number>();
const recentlyMet = new Map<number, number>();
const declinedPeople = new Map<number, number>();
const recentCheckins = new Map<number, number>();
let lastAlreadyMetNoticeAt = 0;
let currentKey: string | null = null;
let runId = 0;
let lastTransitionAt = 0;
let shareScreens = 0;
let freshLocationNext = false;
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

function within(map: Map<number, number>, id: number | null | undefined, ms: number): boolean {
    if (!id) return false;
    const at = map.get(id);
    return !!at && Date.now() - at < ms;
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

export const useProximityPrompt = create<PromptState>((rawSet, get) => {
    const set = (partial: Partial<PromptState>) => {
        lastTransitionAt = Date.now();
        rawSet(partial);
    };

    // A tap in flight, or a result the person is still looking at, is never
    // replaced by the next phone that happens to come close.
    const isBusy = () => {
        const { phase, visible } = get();
        const inFlow = visible || (currentKey !== null && (phase === 'loading' || phase === 'confirm' || phase === 'connecting'));
        if (inFlow && phase !== 'connecting' && Date.now() - lastTransitionAt > STUCK_AFTER_MS) {
            walletLogger.warn(WalletTag.PROXIMITY, 'Recovering a stuck tap prompt', { phase });
            runId++;
            clearLoadingTimer();
            currentKey = null;
            rawSet({ ...INITIAL });
            return false;
        }
        return inFlow;
    };

    /** End the flow without showing anything. */
    const quietly = (blockMs: number) => {
        runId++;
        clearLoadingTimer();
        block(currentKey, blockMs);
        currentKey = null;
        set({ ...INITIAL });
    };

    const showError = (err: unknown, stage: 'preview' | 'confirm', myRun: number) => {
        if (myRun !== runId) return;
        clearLoadingTimer();
        const error = describeProximityError(err, stage);
        const { source, peer, points, mode } = get();
        walletLogger.warn(WalletTag.PROXIMITY, 'Tap failed', { stage, kind: error.kind, source });

        if (error.kind === 'self') {
            quietly(TOKEN_LIFETIME_MS);
            return;
        }

        if (error.kind === 'alreadyMet') {
            if (stage === 'confirm') {
                // Both people pressed Confirm at the same moment — the other
                // phone's request won. For this person that's a success.
                if (peer?.user_id) recentlyMet.set(peer.user_id, Date.now());
                block(currentKey, AFTER_SUCCESS_MS);
                finishSuccess(peer, points, mode);
                return;
            }
            // The preview is rejected before it says who it is, so this can't
            // be keyed by person. Say it once; after a meet (or a notice)
            // rotated codes from the same pair stay silent.
            const { lastMet } = get();
            const metJustNow = !!lastMet && Date.now() - lastMet.at < RECENTLY_MET_MS;
            if (metJustNow || Date.now() - lastAlreadyMetNoticeAt < ALREADY_MET_NOTICE_MS) {
                quietly(TOKEN_LIFETIME_MS);
                return;
            }
            lastAlreadyMetNoticeAt = Date.now();
        }

        set({ visible: true, phase: 'error', error, errorStage: stage });
        haptics.notification(error.tone === 'info' ? 'warning' : 'error');
    };

    const finishSuccess = (peer: PromptPeer | null, points: number, mode: 'irl' | 'networking' | null) => {
        const at = Date.now();
        haptics.notification('success');
        if (shareScreens > 0) {
            // The Tap to Meet screen underneath shows the full success moment
            // (it polls right away on lastMet) — don't stack a second one.
            runId++;
            currentKey = null;
            set({ ...INITIAL, lastMet: { userId: peer?.user_id ?? null, at } });
            return;
        }
        set({
            visible: true,
            phase: 'success',
            peer,
            points,
            mode,
            error: null,
            errorStage: null,
            lastMet: { userId: peer?.user_id ?? null, at },
        });
    };

    const previewToken = async (token: string, myRun: number) => {
        if (!(await storage.getItem('access'))) {
            throw { response: { status: 401, data: {} } };
        }

        // Coordinates only if we can get them without a prompt: networking
        // and IRL previews don't need them. Check-in with a geofence does —
        // that answer comes back as locationRequired and we retry below.
        const fresh = freshLocationNext;
        freshLocationNext = false;
        const quick = await getQuickLocation({ request: false, timeoutMs: 2500, maxAgeMs: fresh ? 10_000 : undefined });
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
            if (loc.status !== 'ok') throw new ProximityClientError('locationUnavailable');
            return await previewProximityToken(token, loc.latitude, loc.longitude);
        }
    };

    const applyPreview = (result: VerifyTokenResponse, myRun: number) => {
        if (myRun !== runId) return;
        clearLoadingTimer();

        if (result.interaction_type === 'checkin') {
            // Already recorded server-side — hand over to the check-in screen,
            // once per event (the organizer's code keeps rotating nearby).
            const postId = result.post_id ?? null;
            if (within(recentCheckins, postId, RECENT_CHECKIN_MS)) {
                quietly(TOKEN_LIFETIME_MS);
                return;
            }
            if (postId) recentCheckins.set(postId, Date.now());
            const verified = !!result.verified;
            haptics.notification(verified ? 'success' : 'error');
            block(currentKey, TOKEN_LIFETIME_MS);
            currentKey = null;
            set({
                ...INITIAL,
                navigation: {
                    pathname: '/event-checkin',
                    params: {
                        _verified: verified ? '1' : '0',
                        _post_id: postId ? String(postId) : '',
                        _post_name: result.post_name || '',
                        _message: result.message || '',
                        _post_image: result.post_image || '',
                    },
                },
            });
            return;
        }

        const peer = result.scanned_user ?? null;
        if (within(recentlyMet, peer?.user_id, RECENTLY_MET_MS) || within(declinedPeople, peer?.user_id, DECLINED_PERSON_MS)) {
            // Same person, rotated token — already met or just said "Not now".
            quietly(TOKEN_LIFETIME_MS);
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
            const fresh = freshLocationNext;
            freshLocationNext = false;
            set({ phase: 'connecting', error: null, errorStage: null });
            try {
                let latitude: number | undefined;
                let longitude: number | undefined;
                if (mode === 'networking') {
                    // Event networking is geofenced: coordinates are required.
                    const loc = await getQuickLocation({ request: true, timeoutMs: 8000, maxAgeMs: fresh ? 10_000 : undefined });
                    if (myRun !== runId) return;
                    if (loc.status === 'denied') throw new ProximityClientError('locationDenied');
                    if (loc.status === 'servicesOff') throw new ProximityClientError('locationServicesOff');
                    if (loc.status === 'mocked') throw new ProximityClientError('mockLocation');
                    if (loc.status !== 'ok') throw new ProximityClientError('locationUnavailable');
                    latitude = loc.latitude;
                    longitude = loc.longitude;
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
                finishSuccess(
                    peer,
                    result.earned_points ?? get().points,
                    result.source === 'irl' || result.interaction_type === 'irl' ? 'irl' : get().mode
                );
            } catch (err) {
                showError(err, 'confirm', myRun);
            }
        },

        retry: () => {
            const { payload, errorStage } = get();
            if (!payload) return;
            // "Outside the event area" can only improve with a new GPS fix.
            freshLocationNext = true;
            if (errorStage === 'confirm') {
                get().confirm();
                return;
            }
            const myRun = ++runId;
            set({ phase: 'loading', error: null, errorStage: null, visible: true });
            runPreview(payload, myRun);
        },

        close: () => {
            const { phase, error, source, peer, kind } = get();
            runId++;
            clearLoadingTimer();
            if (phase === 'success') {
                block(currentKey, AFTER_SUCCESS_MS);
            } else if (phase === 'error') {
                block(currentKey, error?.retryable ? AFTER_RETRYABLE_ERROR_MS[source] : AFTER_FINAL_ERROR_MS);
            } else {
                block(currentKey, AFTER_DECLINE_MS);
                if (phase === 'confirm' && kind === 'meet' && peer?.user_id) {
                    declinedPeople.set(peer.user_id, Date.now());
                }
            }
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
            // still asking "Meet them?" (or confirming, or showing an error for
            // the same person), there's nothing left to do here.
            const { visible, phase, peer } = get();
            if (visible && userId && peer?.user_id === userId && phase !== 'success') {
                quietly(AFTER_SUCCESS_MS);
            }
        },

        setShareScreenActive: (active) => {
            shareScreens = Math.max(0, shareScreens + (active ? 1 : -1));
        },
    };
});
