import Toast from 'react-native-toast-message';
import axios from 'axios';
import validationInput from '../validation/register-validator';
import { storage } from '../utils/storage';
import GetApiUrl from '../utils/url_api';
import { Router } from 'expo-router';

export default async function Register(
    username: string,
    email: string,
    password: string,
    router: Router,
    inviteCode: string,
    strength?: string,
    privacy?: boolean,
) {
    if (!validationInput(username, email, password)) return;

    const weakStrengths = ['Too Weak', 'Weak'];
    if (!strength || weakStrengths.includes(strength)) {
        Toast.show({
            type: 'error',
            text1: 'Password is too weak',
            text2: 'Use at least a mix of letters, numbers and symbols.',
        });
        return;
    }

    if (!privacy) {
        Toast.show({
            type: 'error',
            text1: 'Privacy policy required',
            text2: 'Please accept the Privacy Policy and Terms of Use.',
        });
        return;
    }

    const data: Record<string, string> = { username, email, password };
    if (inviteCode) data.from_invite_code = inviteCode;

    try {
        const response = await axios.post(`${GetApiUrl()}/users/register/`, data);

        storage.setItem('id', `${response.data.user_id}`);
        storage.setItem('access', response.data.data.token.access);
        storage.setItem('refresh', response.data.data.token.refresh);

        Toast.show({
            type: 'success',
            text1: 'Welcome to NextVibe 🎉',
            text2: 'Your account has been created.',
        });

        setTimeout(() => router.push('/profile'), 2000);

    } catch (error: any) {
        const status = error?.response?.status;
        const serverError = error?.response?.data?.error;
        const detail = error?.response?.data?.detail;

        if (serverError === 'invalid_invite_code') {
            Toast.show({
                type: 'error',
                text1: 'Invalid invite code',
                text2: 'Check the code and try again.',
            });
            return;
        }

        if (status === 409 || serverError === 'username_taken') {
            Toast.show({
                type: 'error',
                text1: 'Username taken',
                text2: 'Please choose a different username.',
            });
            return;
        }

        if (status === 400 && detail) {
            Toast.show({
                type: 'error',
                text1: 'Registration failed',
                text2: detail,
            });
            return;
        }

        if (!error?.response) {
            Toast.show({
                type: 'error',
                text1: 'Network error',
                text2: 'Check your connection and try again.',
            });
            return;
        }

        Toast.show({
            type: 'error',
            text1: 'Registration failed',
            text2: 'Something went wrong. Please try again.',
        });
    }
}