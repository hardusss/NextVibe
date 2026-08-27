import axios from "axios";
import GetApiUrl from "../utils/url_api";
import { walletLogger, WalletTag } from "../utils/walletLogger";

interface WalletSignInData {
    pubkey: string;
    signature: Uint8Array;
    message: string;
    username: string;
    isLazorkit?: boolean;
}

export default async function walletSignIn(payload: WalletSignInData, inviteCode?: string) {
    const url = `${GetApiUrl()}/users/wallet-sign-in/`;
    const signatureArray = Array.from(payload.signature);

    const data: any = {
        wallet_address: payload.pubkey,
        signature: signatureArray,
        message: payload.message,
        username: payload.username,
        ...(payload.isLazorkit ? { is_lazorkit: true } : {}),
    };

    if (inviteCode !== undefined) {
        data.from_invite_code = inviteCode;
    }

    walletLogger.info(WalletTag.API, `walletSignIn: Sending POST /users/wallet-sign-in/ for ${payload.pubkey}`, {
        isLazorkit: !!payload.isLazorkit,
        hasInviteCode: !!inviteCode,
        username: payload.username,
    });

    try {
        const response = await axios.post(url, data);
        walletLogger.info(WalletTag.API, `walletSignIn: Auth success for ${payload.pubkey}`, {
            userId: response.data?.user_id,
            username: response.data?.username,
            hasToken: !!response.data?.token,
        });
        return response.data;
    } catch (error) {
        walletLogger.error(WalletTag.API, `walletSignIn: Failed for ${payload.pubkey}`, error);
        throw error;
    }
}