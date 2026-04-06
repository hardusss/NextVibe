import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import { storage } from "../utils/storage";
import { Router } from "expo-router";

export default async function GoogleSignIn(
    username: string,
    email: string,
    avatar_url: string,
    router: Router,
    idToken: string,
    inviteCode?: string,
): Promise<void> {
    const data: Record<string, string> = { username, email, avatar_url, idToken };
    if (inviteCode) data.from_invite_code = inviteCode;

    try {
        const response = await axios.post(`${GetApiUrl()}/users/google-sign-in/`, data);

        storage.setItem("id", `${response.data.user_id}`);
        storage.setItem("access", response.data.token.access);
        storage.setItem("refresh", response.data.token.refresh);

        Toast.show({
            type: 'success',
            text1: 'Welcome to NextVibe 🎉',
            text2: 'Signed in successfully',
        });

        setTimeout(() => router.replace("/profile"), 2000);

    } catch (error: any) {
        const serverError = error?.response?.data?.error;
        const status = error?.response?.status;

        if (serverError === 'invite_code_required') {
            throw error;
        }

        if (serverError === 'invalid_invite_code') {
            Toast.show({
                type: 'error',
                text1: 'Invalid invite code',
                text2: 'Check the code and try again.',
            });
            throw error;
        }

        if (status === 409 || serverError === 'user_exists') {
            Toast.show({
                type: 'info',
                text1: 'Account already exists',
                text2: 'Try logging in instead.',
            });
            return;
        }

        if (!error?.response) {
            Toast.show({
                type: 'error',
                text1: 'Network error',
                text2: 'Check your connection and try again.',
            });
            throw error;
        }

        const detail = error?.response?.data?.detail ?? 'Something went wrong. Please try again.';
        Toast.show({
            type: 'error',
            text1: 'Sign-in failed',
            text2: detail,
        });
        throw error;
    }
}