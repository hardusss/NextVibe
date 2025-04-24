import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function getMediaToPost(post_id: number) {
    const TOKEN = await AsyncStorage.getItem('access');
    
    const response = await axios.get(`${GetApiUrl()}/posts/get-media/`, {
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        },
        params: {
            post_id: post_id
        }
    });
    return response.data;
}
