import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


const getRoccomendationsProfiles = async () => {
    const TOKEN = await storage.getItem("access");
    const ID = await storage.getItem("id");
    const response = await axios.get(`${GetApiUrl()}/users/recommendations/${ID}/`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        }
    })
    return response.data
}

export default getRoccomendationsProfiles;