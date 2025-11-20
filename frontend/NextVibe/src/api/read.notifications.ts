import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function readNotifications() {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/read-notifications/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.put(url, {}, config)
    return response.data
}

