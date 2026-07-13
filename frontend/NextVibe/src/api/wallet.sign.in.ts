import axios from "axios";
import GetApiUrl from "../utils/url_api";

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

    const response = await axios.post(url, data);
    return response.data;
}