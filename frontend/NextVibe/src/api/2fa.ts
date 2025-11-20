import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


export async function connect2FA() {
    const TOKEN = await storage.getItem("access");

    try {
        const response = await axios.get(`${GetApiUrl()}/users/2fa/`, {
            headers: {
                Authorization: `Bearer ${TOKEN}`
            }
        }
    );
        return response.data
    }

    catch (err){
        return err
    }   
}

export async function auth(code: string) {
    const TOKEN = await storage.getItem("access");
    const CONFIG = {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        },
        params: {
            verifyCode: code
        }
    };

    const response = await axios.post(`${GetApiUrl()}/users/2fa/`, {}, CONFIG);

    if (response.data.data === "Success") {
        return true
    }    
    else {
        return false
    }
};

export default async function updateStatus(enable2FA: boolean) {
    const TOKEN = await storage.getItem("access");
    const CONFIG = {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        },
        params: {
            enable: enable2FA
        }
    };

    const response = await axios.put(`${GetApiUrl()}/users/2fa/`, {}, CONFIG)
}