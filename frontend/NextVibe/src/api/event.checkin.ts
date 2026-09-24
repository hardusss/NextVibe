import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export const checkinEvent = async (postId: number, coords?: { lat: number; lng: number }) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/event-checkin/${postId}/`, { coords }, {
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

/**
 * The check-in's POAP: minted now with a wallet, "saved" (status offchain)
 * without one. Always 200 once checked in; `status` says where it stands.
 */
export const claimEventNft = async (postId: number, coords?: { lat: number; lng: number }) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/claim-event-cnft/${postId}/`, { coords, wallet_optional: true }, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};
