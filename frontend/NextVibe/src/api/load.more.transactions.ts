import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function loadMoreTransactionsFromBlockchain(limit: number = 50) {
    const url = GetApiUrl();
    const token = await storage.getItem("access");

    const response = await axios.post(`${url}/wallets/transactions/load-more/`, 
    { limit }, 
    {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return response.data;
}
