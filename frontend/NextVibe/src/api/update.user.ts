import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function updateUser (username?: string, about?: string) {
    if (!username && !about) return;
    const token = await AsyncStorage.getItem("access");

    try {
        const response = await axios.put(`${GetApiUrl()}/users/update/user-text/`, {}, {
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            params: {
                username,
                about,
            },
        }); 

        return response;
    } catch (err) {
        return null;
    }
}