import axios from "axios";
import GetApiUrl from "../utils/url_api";

interface WalletSignInData {
    pubkey: string;
    signature: Uint8Array;
    message: string;
    username: string;
}

export default async function walletSignIn(payload: WalletSignInData) {
    const url = `${GetApiUrl()}/users/wallet-sign-in/`;

    const signatureArray = Array.from(payload.signature);

    const data = {
        wallet_address: payload.pubkey,
        signature: signatureArray,
        message: payload.message,
        username: payload.username,
    };

    const response = await axios.post(url, data);
    return response.data;
}