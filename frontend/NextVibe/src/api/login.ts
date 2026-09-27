import validationInput from "../validation/login-validator";
import axios from "axios";
import GetApiUrl from "../utils/url_api";
import Toast from "react-native-toast-message";
import { Router } from "expo-router";
import { navigateAfterSignIn } from '@/src/navigation/afterSignIn';
import { apiErrorMessage, codeRequired, saveSession, type CodeRequired } from "./emailCodes";

export type LoginOutcome =
    | { status: "signed-in" }
    /** The email isn't confirmed yet: a code went to it (see emailCodes.ts). */
    | { status: "verify"; info: CodeRequired }
    | { status: "failed" };

export default async function Login(email: string, password: string, router: Router): Promise<LoginOutcome> {

    const validation: boolean = validationInput(email, password);
    if (!validation) {
        return { status: "failed" };
    }

    try {
        const response = await axios.post(`${GetApiUrl()}/users/login/`, { email, password });
        await saveSession(response.data);
        Toast.show({
            type: 'success',
            text1: 'Signed in',
            text2: 'Welcome to NextVibe.'
        });
        setTimeout(() => {
            navigateAfterSignIn(router, "/profile", "push");
        }, 2000)
        return { status: "signed-in" };
    } catch (error: any) {
        const info = error?.response?.status === 403 ? codeRequired(error.response.data, email) : null;
        if (info) return { status: "verify", info };
        Toast.show({
            type: 'error',
            text1: 'Sign-in failed',
            text2: apiErrorMessage(error, error?.message ?? 'Please try again.')
        });
        return { status: "failed" };
    }
}
