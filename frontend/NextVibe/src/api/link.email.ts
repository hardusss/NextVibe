import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function linkEmail(email: string) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/link-email/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    };

    const response = await axios.post(url, { email }, config);
    return response.data;
}
