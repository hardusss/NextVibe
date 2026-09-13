import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function deleteAccount() {
    const TOKEN = await storage.getItem("access");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
    };

    const response = await axios.delete(`${GetApiUrl()}/users/delete-account/`, config);

    return response.data;
}
