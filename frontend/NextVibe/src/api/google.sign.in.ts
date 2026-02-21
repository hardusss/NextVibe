import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import { storage } from "../utils/storage";
import { Router } from "expo-router";

export default function GoogleSignIn(username: string, email: string, avatar_url: string, router: Router, idToken: string) {

    const data = {
        username: username,
        email: email,
        avatar_url: avatar_url,
        idToken: idToken
    }
    axios.post(`${GetApiUrl()}/users/google-sign-in/`, data)
    .then(response => {
        storage.setItem("id", `${response.data.user_id}`)
        storage.setItem("access", response.data.token.access)
        storage.setItem("refresh", response.data.token.refresh)
        Toast.show({
            type: 'success',
            text1: 'Registration successful',
            text2: 'Welcome to NextVibe'
        });
        setTimeout(() => {
            router.replace("/profile");
        }, 2000);

    })
    .catch(error => {;
        console.log(error)
        Toast.show({
            type: 'error',
            text1: 'Registration failed',
            text2: 'Username or email already exists, go login!',
        });
    });
}