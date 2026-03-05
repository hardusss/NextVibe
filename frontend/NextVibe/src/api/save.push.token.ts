import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function savePushToken(token: string) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/save-push-token/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.post(url, {
        pushToken: token
    }, config)
    return response.data
}

