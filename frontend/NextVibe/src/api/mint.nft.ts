import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function mintNFT(
    walletAddress: string,
    post_id: number,
    price: number,
    paymentSignature?: string
) {
    const TOKEN = await storage.getItem("access");
    const url = `${GetApiUrl()}/posts/cnft-mint/`;

    try {
        const response = await axios.post(url, {
            walletAddress,
            postId: post_id,
            price,
            paymentSignature
        }, {
            headers: { "Authorization": `Bearer ${TOKEN}` }
        });
        return response.data;
    } catch (e: any) {
        const errorMsg =
            e?.response?.data?.error ||
            e?.response?.data?.detail ||
            e?.message ||
            "Unknown error";

        return {
            success: false,
            error: errorMsg,
        };
    }
}