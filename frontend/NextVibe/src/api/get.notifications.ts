import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function getNotifications(page: number = 1) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/notifications/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params: {
            page
        }
    }

    const response = await axios.get(url, config)
    return response.data
}

