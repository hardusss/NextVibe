import { useState, useEffect } from "react";
import usePortfolio from "./usePortfolio";

/**
 * Retrieves a token by symbol with fallback caching to prevent UI flicker.
 * Persists the last known valid token state while data is refreshing.
 * * @param symbolParam - Token symbol (e.g., "SOL") or router param array.
 * @returns The live token object if available, otherwise the cached version.
 */
export default function useActiveToken(symbolParam: string | string[]) {
    const { data } = usePortfolio();
    
    // Normalize router params which can be string arrays
    const symbol = Array.isArray(symbolParam) ? symbolParam[0] : symbolParam;
    
    const liveToken = data.tokens.find(t => t.symbol === symbol);
    const [cachedToken, setCachedToken] = useState(liveToken);

    // Sync cache whenever live data updates successfully
    useEffect(() => {
        if (liveToken) {
            setCachedToken(liveToken);
        }
    }, [liveToken]);

    // Prioritize fresh data, fall back to cache if live data is missing (e.g., during reload)
    return liveToken || cachedToken;
}