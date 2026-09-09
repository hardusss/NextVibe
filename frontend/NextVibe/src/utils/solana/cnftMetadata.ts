import { useEffect, useState } from "react";

/**
 * Resolves cNFT display data (image / name) from an off-chain metadata URI.
 *
 * List rows must not fetch per render, so results are cached in memory by
 * assetId with a 24h TTL and concurrent requests for the same asset are
 * deduped through a shared in-flight map.
 */

export interface CnftDisplayData {
    image: string | null;
    name: string | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { data: CnftDisplayData; fetchedAt: number }>();
const inFlight = new Map<string, Promise<CnftDisplayData>>();

const NEXTVIBE_METADATA_RE = /\/posts\/(\d+)\/metadata\/(\d+)\/?$/;

/**
 * Parses a NextVibe post-metadata URI into its postId / edition parts.
 * Returns null for third-party URIs.
 */
export function parseNextVibeMetadataUri(uri: string | null): { postId: number; edition: number } | null {
    if (!uri) return null;
    const match = uri.match(NEXTVIBE_METADATA_RE);
    if (!match) return null;
    return { postId: Number(match[1]), edition: Number(match[2]) };
}

/**
 * Fetches and caches the metadata JSON behind `uri`, returning image + name.
 * Never throws — failures cache an empty result for the TTL window so a bad
 * URI is not re-fetched on every render.
 */
export async function resolveCnftDisplayData(assetId: string, uri: string | null): Promise<CnftDisplayData> {
    const cached = cache.get(assetId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }

    const pending = inFlight.get(assetId);
    if (pending) return pending;

    const promise = (async (): Promise<CnftDisplayData> => {
        let data: CnftDisplayData = { image: null, name: null };
        try {
            if (uri) {
                const response = await fetch(uri);
                if (response.ok) {
                    const json = await response.json();
                    data = {
                        image: typeof json?.image === "string" && json.image ? json.image : null,
                        name: typeof json?.name === "string" && json.name ? json.name : null,
                    };
                }
            }
        } catch {
            // Network/parse failure — cache the empty result until TTL expiry.
        }
        cache.set(assetId, { data, fetchedAt: Date.now() });
        inFlight.delete(assetId);
        return data;
    })();

    inFlight.set(assetId, promise);
    return promise;
}

/**
 * React hook wrapper for list/detail rendering.
 * Returns cached data synchronously when available.
 */
export function useCnftDisplayData(assetId: string | null, uri: string | null): CnftDisplayData {
    const cached = assetId ? cache.get(assetId) : undefined;
    const [data, setData] = useState<CnftDisplayData>(cached?.data ?? { image: null, name: null });

    useEffect(() => {
        if (!assetId) return;
        let cancelled = false;
        resolveCnftDisplayData(assetId, uri).then(resolved => {
            if (!cancelled) setData(resolved);
        });
        return () => {
            cancelled = true;
        };
    }, [assetId, uri]);

    return data;
}
