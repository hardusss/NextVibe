import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

/** user_id for a username, or null if nobody has it. */
export default async function lookupUserId(username: string): Promise<number | null> {
    const TOKEN = await storage.getItem("access");
    try {
        const response = await axios.get(`${GetApiUrl()}/users/lookup/`, {
            headers: { "Authorization": `Bearer ${TOKEN}` },
            params: { username },
        });
        return typeof response.data?.user_id === "number" ? response.data.user_id : null;
    } catch (e: any) {
        if (e?.response?.status === 404) return null;
        throw e;
    }
}
