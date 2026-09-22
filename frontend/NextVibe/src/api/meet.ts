import axios from "axios";
import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";
import type { MeetData } from "../utils/meetShare";

/**
 * GET /meet/<slug>: one Proof of Meet. null when it doesn't exist or isn't
 * visible to this account (blocked, banned). The token is optional; with it,
 * people this account blocked stay hidden here too.
 */
export default async function getMeet(slug: string): Promise<MeetData | null> {
    const token = await storage.getItem("access");
    try {
        const response = await axios.get(`${GetApiUrl()}/meet/${encodeURIComponent(slug)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            timeout: 10000,
        });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
    }
}
