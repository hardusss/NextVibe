import axios from "axios";
import { Platform } from "react-native";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

/** Per-post collect state served by the backend (`collect` object). */
export interface CollectInfo {
    minted: number;
    total: number;
    claimedByMe: boolean;
    irlEligible: boolean;
    reservedEditionsActive: boolean;
}

export interface CollectPrepareResponse {
    /** Present on the MWA path */
    claimId?: string;
    transaction?: string;
    expiresAt?: string;
    memo?: string;
    /** Present on the signer:"none" path (mint already finalized) */
    success?: boolean;
    assetId?: string;
    signature?: string;
    edition: number;
    totalSupply: number;
}

export interface CollectSubmitResponse {
    success: boolean;
    edition: number;
    assetId?: string;
    signature?: string;
}

/** API error carrying the backend's machine-readable code (DAILY_LIMIT, SOLD_OUT, ...). */
export class CollectApiError extends Error {
    code: string;
    resetsAt?: string;

    constructor(message: string, code: string, resetsAt?: string) {
        super(message);
        this.name = "CollectApiError";
        this.code = code;
        this.resetsAt = resetsAt;
    }
}

async function postJson<T>(path: string, body: object): Promise<T> {
    const TOKEN = await storage.getItem("access");
    try {
        const response = await axios.post(`${GetApiUrl()}/posts/${path}`, body, {
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                // Lets the backend refuse the MWA path for platforms without MWA.
                "X-Client-Platform": Platform.OS,
            },
        });
        return response.data as T;
    } catch (e: any) {
        const data = e?.response?.data;
        throw new CollectApiError(
            data?.error || e?.message || "Unknown error",
            data?.code || "UNKNOWN",
            data?.resetsAt,
        );
    }
}

/**
 * Phase 1 of the free collect: reserves an edition and returns the partially
 * signed transaction for the user to co-sign. With signer "none" (no MWA
 * available) the backend mints directly and the response is final.
 */
export function collectPrepare(postId: number, signer: "mwa" | "none"): Promise<CollectPrepareResponse> {
    return postJson("collect/prepare/", { postId, signer });
}

/** Phase 2: returns the user-signed transaction for broadcast + confirmation. */
export function collectSubmit(claimId: string, signedTransaction: string): Promise<CollectSubmitResponse> {
    return postJson("collect/submit/", { claimId, signedTransaction });
}
