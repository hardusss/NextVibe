import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function getCountUnreadNotifications() {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/count-unread-notifications/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.get(url, config)
    return response.data.count
}

