import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getBalanceWallet () {

    const TOKEN = await storage.getItem("access")
    const response = await axios.get(`${GetApiUrl()}/wallets/get-balance/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
};