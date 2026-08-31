import { useState, useRef, useCallback, useEffect } from 'react';
import { generateProximityToken, InteractionType } from '@/src/api/proximity.token';

const RENEWAL_INTERVAL_MS = 50_000; // Renew 10s before 60s TTL expires
const BASE_URL = 'https://nextvibe.io';

export function useProximityToken() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenUrl, setTokenUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const renewalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentParamsRef = useRef<{ interactionType: InteractionType; eventId: number } | null>(null);

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
            return newUrl;
        } catch (e: any) {
            console.error('[useProximityToken] Generation failed:', e);
            setError(e?.response?.data?.error || e?.message || 'Token generation failed');
            setIsGenerating(false);
            return null;
        }
    }, []);

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

        renewalIntervalRef.current = setInterval(async () => {
            const params = currentParamsRef.current;
            if (!params) return;

            try {
                const result = await generateProximityToken(params.interactionType, params.eventId);
                const newToken = result.token;
                const newUrl = `${BASE_URL}/u/e?t=${newToken}`;

                setToken(newToken);
                setTokenUrl(newUrl);

                if (onNewUrl) {
                    onNewUrl(newUrl);
                }
            } catch (e) {
                console.error('[useProximityToken] Auto-renewal failed:', e);
            }
        }, RENEWAL_INTERVAL_MS);
    }, []);

    const stopAutoRenewal = useCallback(() => {
        if (renewalIntervalRef.current) {
            clearInterval(renewalIntervalRef.current);
            renewalIntervalRef.current = null;
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
        };
    }, []);

    return {
        token,
        tokenUrl,
        isGenerating,
        error,
        generateToken,
        refreshToken,
        startAutoRenewal,
        stopAutoRenewal,
    };
}
