import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

/**
 * Triggers a refresh of the latest transactions from the blockchain.
 * The indexer fetches the most recent N transactions from Helius
 * and upserts them into the DB (duplicates are skipped).
 */
export default async function refreshTransactionsFromBlockchain(limit: number = 20) {
    const url = GetApiUrl();
    const token = await storage.getItem("access");

    const response = await axios.post(`${url}/wallets/transactions/refresh/`, 
    { limit }, 
    {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return response.data;
}
