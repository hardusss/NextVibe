import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function getNotifications(page: number = 1) {
    const TOKEN = await AsyncStorage.getItem("access");

    const url = `${GetApiUrl()}/users/notifications/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params: {
            page
        }
    }

    const response = await axios.get(url, config)
    return response.data
}

