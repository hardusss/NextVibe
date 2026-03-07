import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function mintNFT(walletAddress: string, post_id: number, price: number, paymentSignature?: string) {
    const TOKEN = await storage.getItem("access");

    const url = `${GetApiUrl()}/posts/cnft-mint/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.post(url, {
        walletAddress,
        postId: post_id,
        price,
        paymentSignature
    }, config)
    return response.data
}

