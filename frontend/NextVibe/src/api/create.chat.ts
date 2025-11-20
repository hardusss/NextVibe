import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function CreateChat(userId: number) {
    const token = await storage.getItem("access");
    const ownerId = await storage.getItem("id");
    if (!token || !ownerId) {
        throw new Error("User is not authenticated");
    }

    try {
        const response = await axios.post(
            `${GetApiUrl()}/chat/create-chat/`,
            {
                "user_ids": [userId, ownerId]
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error creating chat:", error);
        throw error;
    }
}