import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function mintOgNFT() {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/mint-og/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.post(url, {}, config)
    return response.data
}

