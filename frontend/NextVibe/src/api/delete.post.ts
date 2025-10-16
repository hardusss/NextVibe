import axios, { AxiosError } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function deletePost(postId: number) {
    try {
        const token = await AsyncStorage.getItem("access");
        if (token) {
            const response = await axios.delete(`${GetApiUrl()}/posts/delete-post/`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                params: {
                    postId
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