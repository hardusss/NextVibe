import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function readNotifications() {
    const TOKEN = await AsyncStorage.getItem("access");

    const url = `${GetApiUrl()}/users/read-notifications/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.put(url, {}, config)
    return response.data
}

