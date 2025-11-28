import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function updateUser (username?: string, about?: string) {
    if (username === undefined && about === undefined) return;
    const token = await storage.getItem("access");

    try {
        const response = await axios.put(`${GetApiUrl()}/users/update/user-text/`, {}, {
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            params: {
                username,
                about,
            },
        }); 
        return response;
    } catch (err) {
        return null;
    }
}