import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function searchByName (searchName: string)  {
    const TOKEN = await AsyncStorage.getItem("access");

    const config = {
        headers : {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            searchName: searchName
        },
    };

    const response = await axios.get(`${GetApiUrl()}/users/search/`, config)

    return response.data
}