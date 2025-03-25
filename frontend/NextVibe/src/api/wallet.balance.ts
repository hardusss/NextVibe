import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function getBalanceWallet () {

    const TOKEN = await AsyncStorage.getItem("access")
    const response = await axios.get(`${GetApiUrl()}/wallets/get-balance/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
};