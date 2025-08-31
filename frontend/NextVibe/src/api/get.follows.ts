import axios, { AxiosError } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function getFollows(user_id: number, index: number = 0) {
    try {
        const token = await AsyncStorage.getItem("access");
        if (token) {
            const response = await axios.get(`${GetApiUrl()}/users/get-follows/`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                params: {
                    user_id,
                    index
                }
            });
            return response.data;
        } else {
            return null;
        }
    } catch (error) {
        const err = error as AxiosError;
        return err.response?.data;
    }
}