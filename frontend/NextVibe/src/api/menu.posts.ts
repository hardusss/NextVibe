import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


const getMenuPosts = async (id: number) => {
    const TOKEN = await AsyncStorage.getItem("access")
    const response = await axios.get(`${GetApiUrl()}/posts/posts-menu/${id}/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
}

export default getMenuPosts;