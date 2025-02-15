import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


const getRoccomendationsProfiles = async () => {
    const TOKEN = await AsyncStorage.getItem("access");
    const ID = await AsyncStorage.getItem("id");
    const response = await axios.get(`${GetApiUrl()}/users/recommendations/${ID}/`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        }
    })
    return response.data
}

export default getRoccomendationsProfiles;