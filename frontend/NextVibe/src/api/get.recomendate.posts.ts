import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function getRecomendatePosts () {

    try {
        const token = await storage.getItem('access');
        const response = await axios.get(`${GetApiUrl()}/posts/recomendations/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }  
        })
        return response.data;
    }

    catch (error) {
        return null;
    }
}

