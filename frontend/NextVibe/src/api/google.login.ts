import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";


export default function GoogleLogin(email: string) {

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

    })
    .catch(error => {
        console.log(error);
        Toast.show({
            type: 'error',
            text1: 'Login failed',
            text2: 'Somthing wrong(',
        });
    });
}