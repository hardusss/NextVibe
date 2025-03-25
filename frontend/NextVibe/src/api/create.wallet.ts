import axios from 'axios';
import GetApiUrl from "../utils/url_api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const createWallet = async () => {
  try {
    const token = await AsyncStorage.getItem('access');
    const response = await axios.post(`${GetApiUrl()}/wallets/create/`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    AsyncStorage.setItem('wallet', "true");
    return response.data;
  } catch (error) {
    AsyncStorage.setItem('wallet', "true");
    console.error('Error creating wallet:', error);
  }
};

export default createWallet;
