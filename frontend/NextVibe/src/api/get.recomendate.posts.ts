import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function getRecomendatePosts () {

    try {
        const token = await AsyncStorage.getItem('access');
        const response = await axios.get(`${GetApiUrl()}/posts/recomendations/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }  
        })
        return response.data;
    }

    catch (error) {
        console.log(error);
        return null;
    }
}

