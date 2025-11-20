import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


const getMenuPosts = async (id: number, index: number = 0, limit: number = 9) => {
    const TOKEN = await storage.getItem("access")
    const response = await axios.get(`${GetApiUrl()}/posts/posts-menu/${id}/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params: {
            index,
            limit
        }
    })
    return response.data
}

export default getMenuPosts;