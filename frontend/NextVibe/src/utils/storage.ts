import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const useSecure = true; 
const SECURE_KEYS = [
    "access",
    "refresh",
    "id",
    "wallet",
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
