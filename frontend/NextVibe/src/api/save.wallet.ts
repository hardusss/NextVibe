import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function saveWallet(walletAddress: string) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/users/save-wallet/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.post(url, {
       walletAddress
    }, config)
    return response.data
}

