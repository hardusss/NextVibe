import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

interface ResetPasswordData {
    code: string;
    newPassword: string;
}

export default async function resetPassword({ code, newPassword }: ResetPasswordData) {
    const TOKEN = await AsyncStorage.getItem("access");

    try {
        const response = await axios.put(
            `${GetApiUrl()}/users/reset-password/`,
            { newPassword },
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`
                },
                params: {
                    verifyCode: code,
                }
            }
        );
        return response;
    } catch (err) {
        console.error("Error resetting password:", err);
        throw err;
    }
}