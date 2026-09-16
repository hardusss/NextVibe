import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export interface BlockedUser {
    user_id: number;
    username: string;
    avatar: string | null;
    official: boolean;
    seeker_verified: boolean;
    blocked_at: string;
}

/** Resolves on 201 (new block) and 204 (already blocked); throws otherwise. */
export async function blockUser(userId: number): Promise<void> {
    const TOKEN = await storage.getItem("access");
    await axios.post(
        `${GetApiUrl()}/users/block/`,
        { user_id: userId },
        { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
}

/** Idempotent: resolves whether or not a block existed. */
export async function unblockUser(userId: number): Promise<void> {
    const TOKEN = await storage.getItem("access");
    await axios.delete(`${GetApiUrl()}/users/block/${userId}/`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
}

export async function getBlockedUsers(index: number = 0): Promise<{ data: BlockedUser[]; end: boolean }> {
    const TOKEN = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/users/blocked/`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { index },
    });
    return response.data;
}
