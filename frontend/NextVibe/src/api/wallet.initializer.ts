import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function walletInit () {

    const TOKEN = await storage.getItem("access")
    const response = await axios.post(`${GetApiUrl()}/wallets/wallet-init/`, {}, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
};