import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function searchByName (searchName: string)  {
    const TOKEN = await storage.getItem("access");

    const config = {
        headers : {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            searchName: searchName
        },
    };

    const response = await axios.get(`${GetApiUrl()}/users/search/`, config)

    return response.data
}