import { useState, useRef, useCallback, useEffect } from 'react';
import { generateProximityToken, InteractionType } from '@/src/api/proximity.token';

const RENEWAL_INTERVAL_SECONDS = 50;
const RENEWAL_INTERVAL_MS = RENEWAL_INTERVAL_SECONDS * 1000;
const BASE_URL = 'https://nextvibe.io';

export function useProximityToken() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenUrl, setTokenUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRenewing, setIsRenewing] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState<number>(RENEWAL_INTERVAL_SECONDS);
    const [error, setError] = useState<string | null>(null);

    const renewalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentParamsRef = useRef<{ interactionType: InteractionType; eventId: number } | null>(null);

    const startCountdown = useCallback(() => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
        setSecondsLeft(RENEWAL_INTERVAL_SECONDS);
        countdownIntervalRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    return RENEWAL_INTERVAL_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const generateToken = useCallback(async (
        interactionType: InteractionType,
        eventId: number
    ): Promise<string | null> => {
        try {
            setIsGenerating(true);
            setError(null);
            currentParamsRef.current = { interactionType, eventId };

            const result = await generateProximityToken(interactionType, eventId);
            const newToken = result.token;
            const newUrl = `${BASE_URL}/u/e?t=${newToken}`;

            setToken(newToken);
            setTokenUrl(newUrl);
            setIsGenerating(false);
            startCountdown();
            return newUrl;
        } catch (e: any) {
            console.error('[useProximityToken] Generation failed:', e);
            setError(e?.response?.data?.error || e?.message || 'Token generation failed');
            setIsGenerating(false);
            return null;
        }
    }, [startCountdown]);

    const startAutoRenewal = useCallback((
        interactionType: InteractionType,
        eventId: number,
        onNewUrl?: (url: string) => void
    ) => {
        // Stop any existing renewal
        if (renewalIntervalRef.current) {
            clearInterval(renewalIntervalRef.current);
        }

        currentParamsRef.current = { interactionType, eventId };
        startCountdown();

        renewalIntervalRef.current = setInterval(async () => {
            const params = currentParamsRef.current;
            if (!params) return;

            try {
                setIsRenewing(true);
                const result = await generateProximityToken(params.interactionType, params.eventId);
                const newToken = result.token;
                const newUrl = `${BASE_URL}/u/e?t=${newToken}`;

                setToken(newToken);
                setTokenUrl(newUrl);
                setSecondsLeft(RENEWAL_INTERVAL_SECONDS);
                setIsRenewing(false);

                if (onNewUrl) {
                    onNewUrl(newUrl);
                }
            } catch (e) {
                console.error('[useProximityToken] Auto-renewal failed:', e);
                setIsRenewing(false);
            }
        }, RENEWAL_INTERVAL_MS);
    }, [startCountdown]);

    const stopAutoRenewal = useCallback(() => {
        if (renewalIntervalRef.current) {
            clearInterval(renewalIntervalRef.current);
            renewalIntervalRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    }, []);

    const refreshToken = useCallback(async (): Promise<string | null> => {
        const params = currentParamsRef.current;
        if (!params) return null;
        return generateToken(params.interactionType, params.eventId);
    }, [generateToken]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (renewalIntervalRef.current) {
                clearInterval(renewalIntervalRef.current);
                renewalIntervalRef.current = null;
            }
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        };
    }, []);

    return {
        token,
        tokenUrl,
        isGenerating,
        isRenewing,
        secondsLeft,
        totalDuration: RENEWAL_INTERVAL_SECONDS,
        error,
        generateToken,
        refreshToken,
        startAutoRenewal,
        stopAutoRenewal,
    };
}
