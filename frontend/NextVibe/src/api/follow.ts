import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

const followUser = async (follow_id: number): Promise<number> => {
    const TOKEN = await storage.getItem("access");

    try {
        const response = await axios.put(
            `${GetApiUrl()}/users/follow/${follow_id}/`, 
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
            console.error("❌ Axios error:", error.response?.data || error.message);
            return error.response?.status || 500;
        } else {
            console.error("❌ Unknown error:", error);
            return 500;
        }
    }
};

export default followUser;
