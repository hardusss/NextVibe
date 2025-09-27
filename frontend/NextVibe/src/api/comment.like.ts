import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function commentLike(commentId: number, isReply: boolean) {
    const TOKEN = await AsyncStorage.getItem("access");

    const url = `${GetApiUrl()}/posts/comment-like/${commentId}/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params : {
            is_reply: isReply
        }
    }

    const response = await axios.put(url, {}, config)
    return response.data
}

