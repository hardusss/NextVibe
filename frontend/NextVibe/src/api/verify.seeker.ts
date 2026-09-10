import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export interface VerifySeekerResponse {
    seekerVerified: boolean;
    source: "onchain" | "skr" | null;
    error: string | null;
}

/**
 * Manual "Verify Seeker" action — runs the on-chain Genesis Token
 * check for the connected wallet. Error codes: NO_WALLET,
 * SGT_NOT_FOUND, SGT_ALREADY_USED, CHECK_FAILED.
 */
export default async function verifySeeker(): Promise<VerifySeekerResponse> {
    const TOKEN = await storage.getItem("access");
    if (!TOKEN) return { seekerVerified: false, source: null, error: "NO_AUTH" };

    const url = `${GetApiUrl()}/users/seeker/verify/`;
    try {
        const response = await axios.post(url, {}, {
            headers: { "Authorization": `Bearer ${TOKEN}` },
        });
        return response.data;
    } catch (e: any) {
        if (e?.response?.data && typeof e.response.data.seekerVerified === "boolean") {
            return e.response.data;
        }
        return { seekerVerified: false, source: null, error: "CHECK_FAILED" };
    }
}
