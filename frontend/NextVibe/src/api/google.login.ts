import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Router } from "expo-router";

export default function GoogleLogin(email: string, router: Router) {

    const data = {
        email: email,
    }
    axios.post(`${GetApiUrl()}/users/google-login/`, data)
    .then(response => {
        AsyncStorage.setItem("id", `${response.data.user_id}`)
        AsyncStorage.setItem("access", response.data.token.access)
        AsyncStorage.setItem("refresh", response.data.token.refresh)
        Toast.show({
            type: 'success',
            text1: 'Login successfuly!',
            text2: 'Welcome to NextVibe'
        });
        setTimeout(() => {
            router.push("/profile");
        }, 2000);

    })
    .catch(error => {
        Toast.show({
            type: 'error',
            text1: 'Login failed',
            text2: error,
        });
    });
}