import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getTransactions () {
    const url = GetApiUrl();
    const token = await storage.getItem("access");

    const response = await axios.get(`${url}/wallets/transactions/`, {
        headers: {
            Authorization: `Bearer ${token}`,
        }, 
    });

    return response.data;
}