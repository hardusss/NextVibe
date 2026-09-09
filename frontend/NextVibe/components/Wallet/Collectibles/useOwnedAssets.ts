import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import GetApiUrl from "@/src/utils/url_api";

/**
 * Fetches the wallet's NFTs via Helius DAS `getAssetsByOwner`, proxied
 * through the backend RPC endpoint so the Helius key stays server-side
 * (the backend also caches responses for 60s per wallet/page).
 */

const PAGE_LIMIT = 50;
const MAX_PAGES = 4;

export type CollectiblePill = "OG" | "POAP" | "Post" | null;

export interface OwnedAsset {
    /** DAS asset id */
    id: string;
    /** Display name from metadata */
    name: string;
    /** Best-effort image URL (content.links.image || first file uri) */
    image: string | null;
    /** Off-chain metadata URI */
    jsonUri: string | null;
    /** True for Bubblegum compressed NFTs */
    compressed: boolean;
    /** Collection address from grouping, if any */
    collection: string | null;
    /** Collection display name when DAS returns collection metadata */
    collectionName: string | null;
    /** True for assets minted by NextVibe (posts, OG avatars, event POAPs) */
    isNextVibe: boolean;
    /** Small pill label for NextVibe-minted items */
    pill: CollectiblePill;
}

/**
 * Classifies an asset as NextVibe-minted and picks its pill label.
 */
function classifyAsset(name: string, jsonUri: string | null, collectionName: string | null): {
    isNextVibe: boolean;
    pill: CollectiblePill;
} {
    const isNextVibe =
        (jsonUri ?? "").includes("nextvibe.io") ||
        /^NextVibe OG/i.test(name) ||
        (collectionName ?? "").startsWith("NextVibe");

    if (!isNextVibe) return { isNextVibe: false, pill: null };
    if (/^NextVibe OG/i.test(name)) return { isNextVibe: true, pill: "OG" };
    if (/poap|check.?in/i.test(`${name} ${collectionName ?? ""}`)) return { isNextVibe: true, pill: "POAP" };
    if (/^Post by @/i.test(name)) return { isNextVibe: true, pill: "Post" };
    return { isNextVibe: true, pill: null };
}

function mapDasItem(item: any): OwnedAsset | null {
    if (!item?.id) return null;
    const name: string = item.content?.metadata?.name || `NFT ${String(item.id).slice(0, 4)}…`;
    const jsonUri: string | null = item.content?.json_uri ?? null;
    const image: string | null =
        item.content?.links?.image ||
        item.content?.files?.[0]?.uri ||
        null;
    const grouping = (item.grouping ?? []).find((g: any) => g.group_key === "collection");
    const collectionName: string | null = grouping?.collection_metadata?.name ?? null;
    const { isNextVibe, pill } = classifyAsset(name, jsonUri, collectionName);

    return {
        id: item.id,
        name,
        image,
        jsonUri,
        compressed: !!item.compression?.compressed,
        collection: grouping?.group_value ?? null,
        collectionName,
        isNextVibe,
        pill,
    };
}

export default function useOwnedAssets(walletAddress: string | null) {
    const [assets, setAssets] = useState<OwnedAsset[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isFetchingRef = useRef(false);

    const refresh = useCallback(async () => {
        if (!walletAddress || isFetchingRef.current) return;
        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const collected: OwnedAsset[] = [];
            for (let page = 1; page <= MAX_PAGES; page++) {
                const response = await axios.post(`${GetApiUrl()}/wallets/rpc/`, {
                    jsonrpc: "2.0",
                    id: `owned-assets-${page}`,
                    method: "getAssetsByOwner",
                    params: {
                        ownerAddress: walletAddress,
                        page,
                        limit: PAGE_LIMIT,
                        displayOptions: {
                            showUnverifiedCollections: true,
                            showCollectionMetadata: true,
                        },
                    },
                });

                const items: any[] = response.data?.result?.items ?? [];
                collected.push(...items.map(mapDasItem).filter((a): a is OwnedAsset => a !== null));
                if (items.length < PAGE_LIMIT) break;
            }

            // NextVibe collections first, then everything else, newest-style
            // DAS order preserved within each group.
            collected.sort((a, b) => Number(b.isNextVibe) - Number(a.isNextVibe));
            setAssets(collected);
        } catch (err) {
            console.error("useOwnedAssets fetch error:", err);
            setError("Failed to load collectibles");
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [walletAddress]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { assets, loading, error, refresh };
}
