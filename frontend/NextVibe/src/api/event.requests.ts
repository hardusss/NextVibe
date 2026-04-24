import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export const requestToAttend = async (postId: number) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/event-requests/create/${postId}/`, {}, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};

export const getEventRequests = async () => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/event-requests/`, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};

export const actionEventRequest = async (requestId: number, action: 'approve' | 'reject') => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.post(`${GetApiUrl()}/posts/event-requests/action/${requestId}/`, { action }, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};

export const getEventAttendees = async (postId: number) => {
    const TOKEN = await storage.getItem("access");
    const response = await axios.get(`${GetApiUrl()}/posts/event-requests/attendees/${postId}/`, {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    return response.data;
};
