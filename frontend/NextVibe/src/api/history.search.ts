import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export async function setSearchHistory(searchedUser: number) {
    const TOKEN = await storage.getItem("access");
    const ID = await storage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
            "searchedUser": searchedUser
        },
    };

    await axios.post(`${GetApiUrl()}/users/history/`, {}, config)
    
};

export async function getSearchHistory() {
    const TOKEN = await storage.getItem("access");
    const ID = await storage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
        },
    };

    const response = await axios.get(`${GetApiUrl()}/users/history/`, config)

    return response.data
};

export async function deleteUserFromHistory(searchedUser: number) {
    const TOKEN = await storage.getItem("access");
    const ID = await storage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
            "searchedUser": searchedUser
        },
    };

    await axios.delete(`${GetApiUrl()}/users/history/`, config)
    
}