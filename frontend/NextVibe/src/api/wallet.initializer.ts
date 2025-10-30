import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";

export default async function walletInit () {

    const TOKEN = await AsyncStorage.getItem("access")
    const response = await axios.post(`${GetApiUrl()}/wallets/wallet-init/`, {}, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    return response.data
};