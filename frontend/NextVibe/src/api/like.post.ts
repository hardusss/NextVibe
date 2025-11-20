import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

const likePost = async (post_id: number): Promise<number> => {
    const TOKEN = await storage.getItem("access");
    const ID = await storage.getItem("id");

    try {
        const response = await axios.put(
            `${GetApiUrl()}/posts/post-like/${ID}/${post_id}/`, 
            {}, 
            {
                headers: {
                    "Authorization": `Bearer ${TOKEN}`
                }
            }
        );
        return response.status;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Axios error:", error.response?.data || error.message);
            return error.response?.status || 500;
        } else {
            console.error("Unknown error:", error);
            return 500;
        }
    }
};

export default likePost;
