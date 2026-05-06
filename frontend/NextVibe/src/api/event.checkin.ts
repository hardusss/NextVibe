import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export const checkinEvent = async (postId: number) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/event-checkin/${postId}/`, {}, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};

export const getCheckinList = async (postId: number) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/event-checkin/list/${postId}/`, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};

export const claimEventNft = async (postId: number) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/claim-event-cnft/${postId}/`, {}, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};
