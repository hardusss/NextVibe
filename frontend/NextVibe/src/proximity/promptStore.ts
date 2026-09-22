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
export type PromptKind = 'meet' | 'profile' | 'post' | 'payment' | 'checkin';

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
    /** The Proof of Meet a confirmed meet made (success phase). */
    meetSlug: string | null;
    error: ProximityErrorInfo | null;
    errorStage: 'preview' | 'confirm' | null;
    /** Navigation the host performs once the router is ready (not on splash). */
    navigation: PendingNavigation | null;
    /** Last successful meet, from this prompt or reported by a share screen. */
    lastMet: { userId: number | null; at: number } | null;
    /**
     * Bluetooth meet card only: how many times "Not now" was already pressed
     * for this person within the repeat window (0 or 1), so the card can say
     * what happens next. null when no limit applies (NFC/link taps).
     */
    notNowCount: number | null;
    /** Repeat check-in tap for an event already opened recently (compact sheet). */
    checkin: { verified: boolean; postName: string; params: Record<string, string> } | null;
    /** How the last sheet was closed — the scanner re-arms after declines/errors. */
    lastClose: { at: number; outcome: 'declined' | 'error' | 'success' } | null;

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
// Keyed by token (or path). The value is "ignore until".
//
// A deliberate second tap must always work — after "Not now", after an error,
// with the same code. So closing a sheet only blocks the same payload for a
// moment (one tap is often delivered twice: NFC tag read + app link, or a
// Bluetooth re-read). What stops phones that are simply left lying together
// from nagging is the repeat limit: the same outcome dismissed REPEAT_LIMIT
// times within REPEAT_WINDOW_MS goes quiet for REPEAT_QUIET_MS.
const PROCESSING_MS = 120_000;
const DUPLICATE_MS = 3_000;
const REPEAT_WINDOW_MS = 60_000;
const REPEAT_LIMIT = 2;
const REPEAT_QUIET_MS = 60_000;
// After a meet the same pair keeps reading each other's rotating codes; the
// backend answers "already met" — nothing to show right after a success.
const AFTER_SUCCESS_MS = 10 * 60_000;
const RECENTLY_MET_MS = 10 * 60_000;
// A token lives 300s server-side; a "self" answer can't change.
const TOKEN_LIFETIME_MS = 5 * 60_000;
// Check-in: the first result for an event opens the check-in screen; repeats
// within this window get a compact sheet instead of pushing the screen again.
const RECENT_CHECKIN_MS = 10 * 60_000;
// …except over Bluetooth right after the result: that's the attendee still
// standing at the organizer's phone, not a new tap.
const CHECKIN_LINGER_MS = 2 * 60_000;
// Don't flash the sheet for lookups that resolve almost instantly.
const SHOW_LOADING_AFTER_MS = 250;
// Safety net: a flow that hasn't moved for this long (e.g. the sheet could
// not be presented) must not block every future tap.
const STUCK_AFTER_MS = 3 * 60_000;

const blockedUntil = new Map<string, number>();
const recentlyMet = new Map<number, number>();
const checkinResults = new Map<number, { verified: boolean; at: number }>();
const dismissals = new Map<string, number[]>();
let currentKey: string | null = null;
// What the visible sheet is "about", for the repeat limit (person, error, event).
let currentRepeatKey: string | null = null;
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

function recentDismissals(repeatKey: string): number {
    const now = Date.now();
    const recent = (dismissals.get(repeatKey) ?? []).filter((at) => now - at < REPEAT_WINDOW_MS);
    dismissals.set(repeatKey, recent);
    return recent.length;
}

function dismissedTooOften(repeatKey: string): boolean {
    return recentDismissals(repeatKey) >= REPEAT_LIMIT;
}

function noteDismissal(repeatKey: string | null) {
    if (!repeatKey) return;
    const list = dismissals.get(repeatKey) ?? [];
    list.push(Date.now());
    dismissals.set(repeatKey, list);
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
    meetSlug: null,
    error: null,
    errorStage: null,
    checkin: null,
    notNowCount: null,
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
            currentRepeatKey = null;
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
        currentRepeatKey = null;
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

        if (error.kind === 'blocked' && source === 'ble') {
            // Passing a blocked person shouldn't pop anything up; a deliberate
            // NFC or link tap still gets the neutral answer below.
            quietly(TOKEN_LIFETIME_MS);
            return;
        }

        if (error.kind === 'alreadyMet') {
            if (stage === 'confirm') {
                // Both people pressed Confirm at the same moment — the other
                // phone's request won. For this person that's a success; the
                // answer names the meet the other request wrote.
                if (peer?.user_id) recentlyMet.set(peer.user_id, Date.now());
                block(currentKey, AFTER_SUCCESS_MS);
                const slug = (err as any)?.response?.data?.meet_slug;
                finishSuccess(peer, points, mode, typeof slug === 'string' ? slug : null);
                return;
            }
            // The preview is rejected before it says who it is, so this can't
            // be keyed by person. Right after a meet it's the same pair reading
            // each other's rotated codes — stay silent.
            const { lastMet } = get();
            if (lastMet && Date.now() - lastMet.at < RECENTLY_MET_MS) {
                quietly(TOKEN_LIFETIME_MS);
                return;
            }
        }

        const repeatKey = `error:${error.kind}`;
        if (stage === 'preview' && source === 'ble' && dismissedTooOften(repeatKey)) {
            // Phones left together keep re-reading; this answer was already
            // dismissed twice in the last minute.
            quietly(REPEAT_QUIET_MS);
            return;
        }
        currentRepeatKey = repeatKey;
        set({ visible: true, phase: 'error', error, errorStage: stage });
        haptics.notification(error.tone === 'info' ? 'warning' : 'error');
    };

    const finishSuccess = (peer: PromptPeer | null, points: number, mode: 'irl' | 'networking' | null, meetSlug: string | null = null) => {
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
            meetSlug,
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
            // Already recorded server-side (the backend checks in on this call).
            const postId = result.post_id ?? null;
            const verified = !!result.verified;
            const params = {
                _verified: verified ? '1' : '0',
                _post_id: postId ? String(postId) : '',
                _post_name: result.post_name || '',
                _message: result.message || '',
                _post_image: result.post_image || '',
            };
            const previous = postId ? checkinResults.get(postId) : undefined;
            if (postId) checkinResults.set(postId, { verified, at: Date.now() });
            const sameResult = !!previous && previous.verified === verified;
            const repeat = sameResult && Date.now() - previous!.at < RECENT_CHECKIN_MS;
            if (repeat && get().source === 'ble' && Date.now() - previous!.at < CHECKIN_LINGER_MS) {
                quietly(REPEAT_QUIET_MS);
                return;
            }

            if (!repeat) {
                // First result for this event (or it changed, e.g. the organizer
                // approved them since) — open the check-in screen.
                // The check-in screen plays the success/error haptic itself.
                block(currentKey, DUPLICATE_MS);
                currentKey = null;
                set({ ...INITIAL, navigation: { pathname: '/event-checkin', params } });
                return;
            }

            // Tapped again: a compact sheet instead of pushing the screen again.
            const repeatKey = `checkin:${postId}`;
            if (get().source === 'ble' && dismissedTooOften(repeatKey)) {
                quietly(REPEAT_QUIET_MS);
                return;
            }
            currentRepeatKey = repeatKey;
            haptics.impact('rigid');
            set({
                visible: true,
                phase: 'confirm',
                kind: 'checkin',
                checkin: { verified, postName: result.post_name || 'this event', params },
                error: null,
                errorStage: null,
            });
            return;
        }

        const peer = result.scanned_user ?? null;
        if (within(recentlyMet, peer?.user_id, RECENTLY_MET_MS)) {
            // Same person, rotated token — already met.
            quietly(TOKEN_LIFETIME_MS);
            return;
        }
        const repeatKey = peer?.user_id ? `meet:${peer.user_id}` : null;
        if (repeatKey && get().source === 'ble' && dismissedTooOften(repeatKey)) {
            // "Not now" twice in the last minute while the phones stay together.
            quietly(REPEAT_QUIET_MS);
            return;
        }
        currentRepeatKey = repeatKey;

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
            notNowCount: repeatKey && get().source === 'ble' ? recentDismissals(repeatKey) : null,
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
                if (user?.is_blocked || user?.is_blocked_by) {
                    throw new ProximityClientError('blocked');
                }
                clearLoadingTimer();
                const repeatKey = `profile:${payload.userId}`;
                if (get().source === 'ble' && dismissedTooOften(repeatKey)) {
                    quietly(REPEAT_QUIET_MS);
                    return;
                }
                currentRepeatKey = repeatKey;
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
        lastClose: null,

        handle: (rawUrl, source) => {
            const payload = parseProximityPayload(rawUrl);
            if (payload.kind === 'unknown') return false;

            const key = payloadKey(rawUrl, payload);
            if (isBlocked(key)) return false;
            if (isBusy()) return false;

            // Old installs' formats open their original screens.
            if (payload.kind === 'legacy') {
                // Bluetooth re-reads a phone left nearby every ~15s.
                block(key, source === 'ble' ? 60_000 : DUPLICATE_MS);
                set({ navigation: { pathname: payload.path } });
                return true;
            }

            const myRun = ++runId;
            currentKey = key;
            currentRepeatKey = null;
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

            if (kind === 'checkin') {
                const checkin = get().checkin;
                block(currentKey, DUPLICATE_MS);
                currentKey = null;
                currentRepeatKey = null;
                set({ ...INITIAL, navigation: checkin ? { pathname: '/event-checkin', params: checkin.params } : null });
                return;
            }
            if (kind === 'profile' && payload.kind === 'profile') {
                set({ navigation: { pathname: `/u/${payload.userId}` } });
                block(currentKey, DUPLICATE_MS);
                currentKey = null;
                set({ ...INITIAL });
                return;
            }
            if ((kind === 'payment' && payload.kind === 'payment') || (kind === 'post' && payload.kind === 'post')) {
                const pathname = payload.kind === 'payment' ? payload.path : `/u/post/${payload.postId}`;
                set({ navigation: { pathname } });
                block(currentKey, DUPLICATE_MS);
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
                    result.source === 'irl' || result.interaction_type === 'irl' ? 'irl' : get().mode,
                    result.meet_slug ?? null,
                );
            } catch (err) {
                showError(err, 'confirm', myRun);
            }
        },

        retry: () => {
            const { payload, errorStage, error } = get();
            if (!payload) return;
            // "Outside the event area" can only improve with a new GPS fix;
            // other failures (offline, timeout) keep the quick cached one.
            freshLocationNext = !!error && (error.kind === 'notAtVenue' || error.kind.startsWith('location'));
            if (errorStage === 'confirm') {
                get().confirm();
                return;
            }
            const myRun = ++runId;
            set({ phase: 'loading', error: null, errorStage: null, visible: true });
            runPreview(payload, myRun);
        },

        close: () => {
            const { phase } = get();
            runId++;
            clearLoadingTimer();
            let outcome: 'declined' | 'error' | 'success';
            if (phase === 'success') {
                outcome = 'success';
                block(currentKey, AFTER_SUCCESS_MS);
            } else {
                outcome = phase === 'error' ? 'error' : 'declined';
                // Only absorb a duplicate delivery — tapping again must work.
                block(currentKey, DUPLICATE_MS);
                noteDismissal(currentRepeatKey);
            }
            currentKey = null;
            currentRepeatKey = null;
            set({
                visible: false,
                phase: 'loading',
                error: null,
                errorStage: null,
                lastClose: { at: Date.now(), outcome },
            });
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
            const { visible, phase, peer, errorStage } = get();
            const samePerson = !!userId && peer?.user_id === userId && phase !== 'success';
            // A preview error ("check in to their event first"…) knows no
            // person — after a meet it only contradicts the success underneath.
            const staleError = phase === 'error' && errorStage === 'preview';
            if (visible && (samePerson || staleError)) {
                quietly(samePerson ? AFTER_SUCCESS_MS : DUPLICATE_MS);
            }
        },

        setShareScreenActive: (active) => {
            shareScreens = Math.max(0, shareScreens + (active ? 1 : -1));
        },
    };
});
