import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export async function setSearchHistory(searchedUser: number) {
    const TOKEN = await AsyncStorage.getItem("access");
    const ID = await AsyncStorage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
            "searchedUser": searchedUser
        },
    };

    const response = await axios.post(`${GetApiUrl()}/users/history/`, {}, config)
    
};

export async function getSearchHistory() {
    const TOKEN = await AsyncStorage.getItem("access");
    const ID = await AsyncStorage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
        },
    };

    const response = await axios.get(`${GetApiUrl()}/users/history/`, config)

    return response.data
};

export async function deleteUserFromHistory(searchedUser: number) {
    const TOKEN = await AsyncStorage.getItem("access");
    const ID = await AsyncStorage.getItem("id");

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
        },
        params: {
            "user": ID,
            "searchedUser": searchedUser
        },
    };

    const response = await axios.delete(`${GetApiUrl()}/users/history/`, config)
    
}