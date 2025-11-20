import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function generateImage(promt: string) {
    try {
        const token = await storage.getItem("access");
        const response = await axios.post(`${GetApiUrl()}/posts/generate-image/`, {}, {
            headers: {
            Authorization: `Bearer ${token}` ,
            },
            params: {
                promt: promt
            } 
        });

        return response.data;
    } catch (error) {
        
    }
}