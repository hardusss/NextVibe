import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


const getPost = async (postId: number) => {
    const TOKEN = await storage.getItem("access")
    const response = await axios.get(`${GetApiUrl()}/posts/get-post/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params: {
            postId
        }
    })
    return response.data
}

export default getPost;