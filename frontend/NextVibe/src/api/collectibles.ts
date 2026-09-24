/**
 * Wallet-optional collectibles: everything someone holds from NextVibe, on
 * Solana or not yet (backend posts/src/collectibles.py).
 *
 *   GET   /users/<username>/collectibles?kind=&cursor=   the cNFT tab
 *   GET   /collectibles/<id>                             one item (the detail sheet)
 *   POST  /collectibles/<id>/claim                       mine: this one to my wallet now
 *   POST  /collectibles/claim-all                        mine: everything off-chain
 *   GET   /me/collectibles/summary?tz=                   counts for the banner
 *   GET/PATCH /me/notification-settings                  Settings → Notifications
 */
import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export type CollectibleKind = "poap" | "meet" | "post" | "badge" | "external";
export type CollectibleStatus = "offchain" | "queued" | "minting" | "minted" | "failed";
export type CollectibleFilter = "all" | "poap" | "meet" | "post";

export interface CollectiblePerson {
    user_id: number;
    username: string;
    avatar: string | null;
    deleted: boolean;
}

export interface Collectible {
    /** A number for our items; "das:<asset id>" for other things in the owner's wallet. */
    id: number | string;
    kind: CollectibleKind;
    kind_label: string;
    name: string;
    image_url: string | null;
    recorded_at: string | null;
    edition: number | null;
    onchain: boolean;
    asset_id: string | null;
    minted_at: string | null;
    wallet: string | null;
    explorer_url: string | null;
    metadata_uri: string | null;
    claimed_later: boolean;
    event_id: number | null;
    post_id: number | null;
    meet_slug: string | null;
    with: CollectiblePerson | null;
    /** DAS items only */
    collection?: string | null;
    /** The owner only */
    status?: CollectibleStatus;
    can_claim?: boolean;
    error?: string | null;
}

export interface CollectibleDetail extends Collectible {
    description: string | null;
    attributes: { trait_type: string; value: string | number }[];
    owner_user: { user_id: number; username: string };
}

export interface CollectiblesSummary {
    offchain: number;
    failed: number;
    queued: number;
    /** queued + minting */
    minting: number;
    minted: number;
    /** offchain + failed: what a Claim button would put on Solana */
    claimable: number;
    total: number;
    has_wallet: boolean;
    wallet_reminders: boolean;
}

export interface CollectibleCounts {
    all: number;
    poap: number;
    meet: number;
    post: number;
    badge: number;
}

export interface OgAvatarInfo {
    isOG: boolean;
    edition: number;
    image_url: string;
    minted_at: string;
}

export interface CollectiblesPage {
    user: { user_id: number; username: string };
    owner: boolean;
    items: Collectible[];
    next_cursor: string | null;
    /** First page only */
    counts?: CollectibleCounts;
    og_avatar?: OgAvatarInfo | null;
    summary?: CollectiblesSummary;
    external?: Collectible[];
}

export class CollectiblesApiError extends Error {
    constructor(public code: string, message: string, public status: number | null) {
        super(message);
    }
}

async function headers(): Promise<Record<string, string>> {
    const token = await storage.getItem("access");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function toError(error: unknown): CollectiblesApiError {
    if (axios.isAxiosError(error)) {
        const data: any = error.response?.data ?? {};
        const status = error.response?.status ?? null;
        if (!error.response) return new CollectiblesApiError("NETWORK", "Check your connection and try again.", null);
        return new CollectiblesApiError(data.code ?? `HTTP_${status}`, data.error ?? "Something went wrong. Try again.", status);
    }
    return new CollectiblesApiError("UNKNOWN", "Something went wrong. Try again.", null);
}

async function call<T>(run: (h: Record<string, string>) => Promise<{ data: T }>): Promise<T> {
    try {
        return (await run(await headers())).data;
    } catch (error) {
        throw toError(error);
    }
}

/** The phone's IANA time zone: the reminders stay inside 10:00–21:00 there. */
function timeZone(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        return undefined;
    }
}

export function listCollectibles(
    username: string,
    options: { kind?: CollectibleFilter; cursor?: string | null; limit?: number } = {},
): Promise<CollectiblesPage> {
    const params: Record<string, string | number> = {};
    if (options.kind && options.kind !== "all") params.kind = options.kind;
    if (options.cursor) params.cursor = options.cursor;
    if (options.limit) params.limit = options.limit;
    return call((h) => axios.get(`${GetApiUrl()}/users/${encodeURIComponent(username)}/collectibles`, {
        headers: h, params, timeout: 15000,
    }));
}

export const getCollectible = (id: number) =>
    call<CollectibleDetail>((h) => axios.get(`${GetApiUrl()}/collectibles/${id}`, { headers: h, timeout: 10000 }));

/** 202 with the card; `no_wallet` (400) means: open the connect sheet. */
export const claimCollectible = (id: number) =>
    call<{ collectible: Collectible }>((h) =>
        axios.post(`${GetApiUrl()}/collectibles/${id}/claim`, {}, { headers: h, timeout: 15000 }));

export const claimAllCollectibles = () =>
    call<{ queued: number; summary: CollectiblesSummary }>((h) =>
        axios.post(`${GetApiUrl()}/collectibles/claim-all`, {}, { headers: h, timeout: 15000 }));

export const getCollectiblesSummary = () =>
    call<CollectiblesSummary>((h) => axios.get(`${GetApiUrl()}/me/collectibles/summary`, {
        headers: h, params: timeZone() ? { tz: timeZone() } : {}, timeout: 10000,
    }));

export const getNotificationSettings = () =>
    call<{ wallet_reminders: boolean }>((h) => axios.get(`${GetApiUrl()}/me/notification-settings`, { headers: h, timeout: 10000 }));

export const setWalletReminders = (enabled: boolean) =>
    call<{ wallet_reminders: boolean }>((h) =>
        axios.patch(`${GetApiUrl()}/me/notification-settings`, { wallet_reminders: enabled }, { headers: h, timeout: 10000 }));
