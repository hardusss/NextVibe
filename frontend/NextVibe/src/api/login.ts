import validationInput from "../validation/login-validator";
import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Router } from "expo-router";

export default async function Login(email: string, password: string, router: Router){

    const validation: boolean = validationInput(email, password);
    if (!validation) {
        return;
    }

    const data = {
        email: email,
        password: password 
    }
    axios.post(`${GetApiUrl()}/users/login/`, data)
    .then(response => {
        AsyncStorage.setItem("id", `${response.data.user_id}`)
        AsyncStorage.setItem("access", response.data.token.access)
        AsyncStorage.setItem("refresh", response.data.token.refresh)
        Toast.show({
            type: 'success',
            text1: 'Registration successful',
            text2: 'Welcome to NextVibe'
        });
        setTimeout(() => {
            router.push("/profile");
        }, 2000)

    })
    .catch(error => {
        Toast.show({
            type: 'error',
            text1: 'Registration failed',
            text2: error.message
        });
    });
}