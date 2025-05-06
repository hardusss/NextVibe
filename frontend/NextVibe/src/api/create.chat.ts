import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function CreateChat(userId: number) {
    const token = await AsyncStorage.getItem("access");
    const ownerId = await AsyncStorage.getItem("id");
    if (!token || !ownerId) {
        throw new Error("User is not authenticated");
    }

    try {
        const response = await axios.post(
            `${GetApiUrl()}/chat/create-chat/`,
            {
                "user_ids": [userId, ownerId]
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error creating chat:", error);
        throw error;
    }
}