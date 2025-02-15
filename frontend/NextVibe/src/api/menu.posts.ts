import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


const getMenuPosts = async () => {
    const TOKEN = await AsyncStorage.getItem("access")
    const USER_ID = await AsyncStorage.getItem("id")
    const response = await axios.get(`${GetApiUrl()}/posts/posts-menu/${USER_ID}/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
}

export default getMenuPosts;