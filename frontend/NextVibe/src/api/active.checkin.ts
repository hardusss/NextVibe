import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export interface ActiveEvent {
    event_id: number;
    event_name: string;
    event_image: string | null;
    checked_in_at: string;
}

export const getActiveCheckins = async (): Promise<ActiveEvent[]> => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/active-checkin/`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    return response.data?.active_events || [];
};
