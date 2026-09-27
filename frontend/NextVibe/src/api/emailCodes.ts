import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

/**
 * Six-digit codes sent by email (backend verification/views.py):
 * confirming the email of an email + password account, and resetting a
 * password. The confirm and reset calls answer like login, with tokens.
 */
export interface Session {
    user_id: number;
    token: { access: string; refresh: string };
}

/** What sign-in or sign-up answers while the email isn't confirmed yet. */
export interface CodeRequired {
    email: string;
    resendIn: number;
    sendError?: string;
}

export const DEFAULT_RESEND_SECONDS = 60;

export async function saveSession(session: Session) {
    await storage.setItem("id", `${session.user_id}`);
    await storage.setItem("access", session.token.access);
    await storage.setItem("refresh", session.token.refresh);
}

/** The code step's details when the server asks for one (login 403, register 201), else null. */
export function codeRequired(data: any, fallbackEmail: string): CodeRequired | null {
    if (!data || (data.code !== "EMAIL_NOT_VERIFIED" && data.verification_required !== true)) return null;
    return {
        email: typeof data.email === "string" && data.email ? data.email : fallbackEmail,
        resendIn: Number(data.resendIn) || DEFAULT_RESEND_SECONDS,
        sendError: typeof data.sendError === "string" ? data.sendError : undefined,
    };
}

/** The server's message for a failed call, or `fallback`. */
export function apiErrorMessage(error: any, fallback: string): string {
    const data = error?.response?.data;
    if (!error?.response) return "Check your connection and try again.";
    return data?.error || data?.detail || data?.non_field_errors?.[0] || fallback;
}

/** Seconds to wait before another code can be sent, when the server said so. */
export function retryAfter(error: any): number | null {
    const seconds = Number(error?.response?.data?.retryIn);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export async function verifyEmail(email: string, password: string, code: string): Promise<Session> {
    const { data } = await axios.post(`${GetApiUrl()}/users/email/verify/`, { email, password, code });
    return data;
}

/** A new confirmation code; answers the seconds until the next one. */
export async function sendEmailCode(email: string, password: string): Promise<number> {
    const { data } = await axios.post(`${GetApiUrl()}/users/email/send-code/`, { email, password });
    return Number(data?.resendIn) || DEFAULT_RESEND_SECONDS;
}

/** A password reset code, if an account has this email (the answer is the same either way). */
export async function requestPasswordReset(email: string): Promise<number> {
    const { data } = await axios.post(`${GetApiUrl()}/users/password/forgot/`, { email });
    return Number(data?.resendIn) || DEFAULT_RESEND_SECONDS;
}

/** Sets the new password; every other device is signed out, this one gets the returned session. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<Session> {
    const { data } = await axios.post(`${GetApiUrl()}/users/password/reset/`, { email, code, newPassword });
    return data;
}
