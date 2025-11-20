import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export default async function createComment(content: string, postId: number) {
    const TOKEN = await storage.getItem("access");
    const OWNER_ID = await storage.getItem("id");

    const url = `${GetApiUrl()}/posts/comment-create/`;
    
    const data = {
        content: content,
        post: postId,
        owner: OWNER_ID
    }

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    }

    const response = await axios.post(url, data, config)
    return response.data
}
