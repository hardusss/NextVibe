import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function getStatusProfile() {
    const TOKEN = await AsyncStorage.getItem("access");

    const url = `${GetApiUrl()}/users/check-status/`;

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    }

    const response = await axios.get(url, config)
    return response.data
}

