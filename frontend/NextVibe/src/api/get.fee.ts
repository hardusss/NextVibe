import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function getTransactionFee(token: string) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/wallets/fee/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params : {
            token
        }
    }

    const response = await axios.get(url, config)
    return response.data
}

