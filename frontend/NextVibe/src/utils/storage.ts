import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const useSecure = true;
const SECURE_KEYS = [
    "access",
    "refresh",
    "id",
    "wallet",
    // Deep-link wallet state must not survive logout/account switches —
    // a leaked address triggers "already linked to another account" for
    // the next user on this device.
    "deeplink_wallet_address",
    "deeplink_wallet_type",
    "deeplink_wallet_session",
    "deeplink_pending_handshake",
    "deeplink_wallet_pending_save",
];

export const storage = {
  setItem: async (key: any, value: any) => {
    if (useSecure) {
      return await SecureStore.setItemAsync(key, value);
    } else {
      return await AsyncStorage.setItem(key, value);
    }
  },

  getItem: async (key: any) => {
    if (useSecure) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  },

  removeItem: async (key: any) => {
    if (useSecure) {
      return await SecureStore.deleteItemAsync(key);
    } else {
      return await AsyncStorage.removeItem(key);
    };
  },
  clearAll: async () => {
    if (useSecure) {
        for (const key of SECURE_KEYS) {
        await SecureStore.deleteItemAsync(key);
        }
    } else {
        await AsyncStorage.clear();
    }
},
};
