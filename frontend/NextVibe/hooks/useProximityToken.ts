import { useState, useRef, useCallback, useEffect } from 'react';
import { generateProximityToken, InteractionType } from '@/src/api/proximity.token';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

// How often a fresh code is broadcast. Codes stay valid on the server for
// TOKEN_TTL (300s), so a few failed renewals in a row are harmless.
const RENEWAL_INTERVAL_SECONDS = 50;
const RENEWAL_INTERVAL_MS = RENEWAL_INTERVAL_SECONDS * 1000;
// Treat the broadcast code as stale a little before the server drops it.
const STALE_AFTER_MS = 270_000;
const RETRY_DELAYS_MS = [4000, 8000, 15000, 30000];
const BASE_URL = 'https://nextvibe.io';

export function useProximityToken() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenUrl, setTokenUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRenewing, setIsRenewing] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState<number>(RENEWAL_INTERVAL_SECONDS);
    // The first code for this session couldn't be created — nothing is broadcast.
    const [error, setError] = useState<string | null>(null);
    const [errorObject, setErrorObject] = useState<unknown>(null);
    // A renewal failed; the previous code is still being broadcast.
    const [renewalFailing, setRenewalFailing] = useState(false);
    // The broadcast code has (almost) expired server-side.
    const [isStale, setIsStale] = useState(false);
    // Mode as the server resolved it — it may upgrade an 'irl' request to
    // 'networking' when the user has an active event check-in.
    const [resolvedType, setResolvedType] = useState<InteractionType | null>(null);
    const [resolvedEventId, setResolvedEventId] = useState<number | null>(null);

    const renewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentParamsRef = useRef<{ interactionType: InteractionType; eventId?: number } | null>(null);
    const onNewUrlRef = useRef<((url: string) => void) | null>(null);
    const lastIssuedAtRef = useRef<number>(0);
    const failuresRef = useRef(0);
    const renewingRef = useRef(false);
    const mountedRef = useRef(true);
    // Bumped by start/stop so a renewal already in flight can't reschedule
    // itself after auto-renewal was stopped.
    const renewalGenerationRef = useRef(0);
    // Each request wins only if nothing newer was asked for meanwhile: the
    // organizer sheet can be closed for event A and reopened for event B
    // while A's code is still in flight.
    const requestIdRef = useRef(0);

    const clearTimers = useCallback(() => {
        if (renewalTimerRef.current) {
            clearTimeout(renewalTimerRef.current);
            renewalTimerRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    }, []);

    const startCountdown = useCallback(() => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
        setSecondsLeft(RENEWAL_INTERVAL_SECONDS);
        countdownIntervalRef.current = setInterval(() => {
            setSecondsLeft((prev) => (prev <= 1 ? 1 : prev - 1));
            if (lastIssuedAtRef.current && Date.now() - lastIssuedAtRef.current > STALE_AFTER_MS) {
                setIsStale(true);
            }
        }, 1000);
    }, []);

    const applyResult = useCallback((result: { token: string; interaction_type?: InteractionType; event_id?: number | null },
        requested: { interactionType: InteractionType; eventId?: number }) => {
        const newUrl = `${BASE_URL}/u/e?t=${result.token}`;
        const serverType = result.interaction_type ?? requested.interactionType;
        const serverEventId = result.event_id ?? requested.eventId ?? null;
        if (serverType !== requested.interactionType) {
            walletLogger.info(WalletTag.PROXIMITY, 'Server resolved a different mode', {
                requested: requested.interactionType, resolved: serverType, eventId: serverEventId,
            });
        }
        // Renew with the resolved mode so rotations stay consistent.
        currentParamsRef.current = { interactionType: serverType, eventId: serverEventId ?? undefined };
        lastIssuedAtRef.current = Date.now();
        failuresRef.current = 0;
        setResolvedType(serverType);
        setResolvedEventId(serverEventId);
        setToken(result.token);
        setTokenUrl(newUrl);
        setRenewalFailing(false);
        setIsStale(false);
        setSecondsLeft(RENEWAL_INTERVAL_SECONDS);
        return newUrl;
    }, []);

    const generateToken = useCallback(async (
        interactionType: InteractionType,
        eventId?: number
    ): Promise<string | null> => {
        const myRequest = ++requestIdRef.current;
        try {
            setIsGenerating(true);
            setError(null);
            setErrorObject(null);
            currentParamsRef.current = { interactionType, eventId };

            const result = await generateProximityToken(interactionType, eventId);
            if (!mountedRef.current || myRequest !== requestIdRef.current) return null;
            const newUrl = applyResult(result, { interactionType, eventId });
            setIsGenerating(false);
            startCountdown();
            return newUrl;
        } catch (e: any) {
            walletLogger.error(WalletTag.PROXIMITY, 'Token generation failed', e);
            if (!mountedRef.current || myRequest !== requestIdRef.current) return null;
            setError(e?.response?.data?.error || e?.message || 'Token generation failed');
            setErrorObject(e);
            setIsGenerating(false);
            return null;
        }
    }, [applyResult, startCountdown]);

    const scheduleRenewal = useCallback((delayMs: number) => {
        if (renewalTimerRef.current) clearTimeout(renewalTimerRef.current);
        const generation = renewalGenerationRef.current;
        const current = () => mountedRef.current && generation === renewalGenerationRef.current;
        renewalTimerRef.current = setTimeout(async () => {
            renewalTimerRef.current = null;
            const params = currentParamsRef.current;
            if (!params || !current()) return;
            if (renewingRef.current) {
                // A renewal from before a restart is still finishing — try again shortly.
                scheduleRenewal(1000);
                return;
            }

            renewingRef.current = true;
            setIsRenewing(true);
            const myRequest = ++requestIdRef.current;
            try {
                const result = await generateProximityToken(params.interactionType, params.eventId);
                if (!current() || myRequest !== requestIdRef.current) return;
                const newUrl = applyResult(result, params);
                onNewUrlRef.current?.(newUrl);
                scheduleRenewal(RENEWAL_INTERVAL_MS);
            } catch (e) {
                walletLogger.error(WalletTag.PROXIMITY, 'Token auto-renewal failed', e);
                if (!current()) return;
                // Keep broadcasting the previous code (still valid server-side)
                // and retry soon instead of waiting a whole interval.
                const attempt = failuresRef.current++;
                setRenewalFailing(true);
                scheduleRenewal(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
            } finally {
                renewingRef.current = false;
                if (mountedRef.current) setIsRenewing(false);
            }
        }, delayMs);
    }, [applyResult]);

    const startAutoRenewal = useCallback((
        interactionType: InteractionType,
        eventId?: number,
        onNewUrl?: (url: string) => void
    ) => {
        // Keep the server-resolved params from the preceding generateToken.
        if (!currentParamsRef.current) {
            currentParamsRef.current = { interactionType, eventId };
        }
        onNewUrlRef.current = onNewUrl ?? null;
        renewalGenerationRef.current++;
        startCountdown();
        scheduleRenewal(RENEWAL_INTERVAL_MS);
    }, [scheduleRenewal, startCountdown]);

    const stopAutoRenewal = useCallback(() => {
        renewalGenerationRef.current++;
        // Anything still in flight belongs to the session being stopped.
        requestIdRef.current++;
        clearTimers();
        onNewUrlRef.current = null;
    }, [clearTimers]);

    /**
     * Renew right now (e.g. the app returned to the foreground, where JS
     * timers were paused). No-op when auto-renewal isn't running.
     */
    const renewNow = useCallback(() => {
        if (!onNewUrlRef.current) return;
        scheduleRenewal(0);
    }, [scheduleRenewal]);

    // Synchronous read of the server-resolved params — usable right after an
    // awaited generateToken, before React state has re-rendered.
    const getResolvedParams = useCallback(() => currentParamsRef.current, []);

    const refreshToken = useCallback(async (): Promise<string | null> => {
        const params = currentParamsRef.current;
        if (!params) return null;
        return generateToken(params.interactionType, params.eventId);
    }, [generateToken]);

    const lastIssuedAt = useCallback(() => lastIssuedAtRef.current, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearTimers();
        };
    }, [clearTimers]);

    return {
        token,
        tokenUrl,
        isGenerating,
        isRenewing,
        secondsLeft,
        totalDuration: RENEWAL_INTERVAL_SECONDS,
        error,
        errorObject,
        renewalFailing,
        isStale,
        resolvedType,
        resolvedEventId,
        getResolvedParams,
        lastIssuedAt,
        generateToken,
        refreshToken,
        startAutoRenewal,
        stopAutoRenewal,
        renewNow,
    };
}
