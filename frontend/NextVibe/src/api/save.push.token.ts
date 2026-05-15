import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function savePushToken(token: string) {
    const TOKEN = await storage.getItem("access");
    if (!TOKEN) return; 

    const url = `${GetApiUrl()}/users/save-push-token/`;
    try {
        const response = await axios.post(url, 
            { pushToken: token },
            { headers: { "Authorization": `Bearer ${TOKEN}` } }
        );
        return response.data;
    } catch (e) {
        throw e;
    }
}

