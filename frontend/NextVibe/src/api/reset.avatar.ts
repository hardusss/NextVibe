import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function resetAvatar ()  {
    const TOKEN = await AsyncStorage.getItem("access");
    
    const config = {
        headers : {
            "Authorization": `Bearer ${TOKEN}`,
        },
    };

    const response = await axios.delete(`${GetApiUrl()}/users/update/user-avatar/`, config)

    return response.data
}