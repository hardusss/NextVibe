import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";


export default function GoogleRegister(username: string, email: string, avatar_url: string) {

    const data = {
        username: username,
        email: email,
        avatar_url: avatar_url
    }
    axios.post(`${GetApiUrl()}/users/google-register/`, data)
    .then(response => {
        AsyncStorage.setItem("id", `${response.data.user_id}`)
        AsyncStorage.setItem("access", response.data.token.access)
        AsyncStorage.setItem("refresh", response.data.token.refresh)
        Toast.show({
            type: 'success',
            text1: 'Registration successful',
            text2: 'Welcome to NextVibe'
        });

    })
    .catch(error => {
        console.log(error);
        Toast.show({
            type: 'error',
            text1: 'Registration failed',
            text2: 'Username or email already exists, go login!',
        });
    });
}