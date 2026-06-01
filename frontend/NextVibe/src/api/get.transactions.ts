import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getTransactions (lastSignature?: string) {
    const url = GetApiUrl();
    const token = await storage.getItem("access");

    const params = lastSignature ? { lastSignature } : {};

    const response = await axios.get(`${url}/api/v1/wallets/transactions/`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        params,
    });

    return response.data;
}