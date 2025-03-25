import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export async function sendBtcTransaction(
  amount: number,
  address: string
) {
  try {
    const token = await AsyncStorage.getItem("access");
    const url = `${GetApiUrl()}/wallets/transaction/btc/`;
    const response = await axios.post(url, {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          amount,
          to_address: address,
        },
      }
    );
    if (response.status === 200) {
      return response.data;
    } else {
      return "Error sending transaction";
    }
  } catch (error: any) {
    return "Error sending transaction";
  }
}

export async function sendSolTransaction(
  amount: number,
  address: string
) {
  try {
    const token = await AsyncStorage.getItem("access");
    const url = `${GetApiUrl()}/wallets/transaction/sol/`;
    const response = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          amount,
          to_address: address,
        },
      }
    );
    if (response.status === 200) {
      return response.data;
    } else {
      return "Error sending transaction";
    }
  } catch (error: any) {
    return error.response.data;
  }
}

export async function sendTrxTransaction(amount: number, address: string) {
  try {
    const token = await AsyncStorage.getItem("access");
    const url = `${GetApiUrl()}/wallets/transaction/trx/`;
    const response = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          amount,
          to_address: address,
        },
      }
    );
    if (response.status === 200) {
      return response.data;
    } else {
      return "Error sending transaction";
    }
  } catch (error: any) {
    return error.response.data;
  }
}