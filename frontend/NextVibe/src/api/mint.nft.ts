import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

/**
 * Owner-only publish: mints the owner's edition of their own post as a cNFT.
 * Free — the backend pays the network fee. Collectors use `src/api/collect`.
 */
export default async function mintNFT(
    walletAddress: string,
    post_id: number,
) {
    const TOKEN = await storage.getItem("access");
    const url = `${GetApiUrl()}/posts/cnft-mint/`;

    try {
        const response = await axios.post(url, {
            walletAddress,
            postId: post_id,
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
