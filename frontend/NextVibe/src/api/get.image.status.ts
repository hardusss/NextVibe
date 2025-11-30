import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function generateImageStatus(taskId: string) {
    try {
        const token = await storage.getItem("access");
        const response = await axios.get(`${GetApiUrl()}/posts/generate-image/status/`, {
            headers: {
            Authorization: `Bearer ${token}` ,
            },
            params: {
                taskId
            } 
        });

        return response.data;
    } catch (error) {
        
    }
}