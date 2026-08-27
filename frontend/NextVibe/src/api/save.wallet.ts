import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";
import { walletLogger, WalletTag, extractErrorMessage } from "../utils/walletLogger";

export default async function saveWallet(walletAddress: string) {
    const TOKEN = await storage.getItem("access");
    const url = `${GetApiUrl()}/users/save-wallet/`;

    walletLogger.info(WalletTag.API, `saveWallet: Initiating POST /users/save-wallet/ for ${walletAddress}`, {
        hasToken: !!TOKEN,
        tokenPrefix: TOKEN ? `${TOKEN.slice(0, 10)}...` : null,
        url,
    });

    if (!TOKEN) {
        const noAuthError = new Error("Not authenticated. Please log in before connecting or saving a wallet.");
        walletLogger.warn(WalletTag.API, 'saveWallet: User is not authenticated (no access token in storage)', { walletAddress });
        throw noAuthError;
    }

    const config = {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
    };

    try {
        const response = await axios.post(url, {
            walletAddress
        }, config);
        walletLogger.info(WalletTag.API, `saveWallet: Successfully linked wallet address ${walletAddress}`, response.data);
        return response.data;
    } catch (error: any) {
        const errMsg = extractErrorMessage(error);
        walletLogger.error(WalletTag.API, `saveWallet: Failed to save wallet ${walletAddress}: ${errMsg}`, error, {
            status: error?.response?.status,
            responseData: error?.response?.data,
        });
        throw error;
    }
}



