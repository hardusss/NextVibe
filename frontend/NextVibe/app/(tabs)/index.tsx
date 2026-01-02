import { Redirect } from "expo-router";
import { LogBox } from 'react-native';
import { setupAxiosInterceptor } from "@/src/utils/axiosInterceptor";
import React, { useEffect } from 'react';
import * as Updates from 'expo-updates';
// Connect Buffer for LazorKit
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

setupAxiosInterceptor();
LogBox.ignoreAllLogs(true); 

export default function Index() {
     useEffect(() => {
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        console.log('Update available?', update.isAvailable);

        if (update.isAvailable) {
          console.log('Fetching update...');
          await Updates.fetchUpdateAsync();
          console.log('Reloading app...');
          await Updates.reloadAsync(); 
        }
      } catch (e) {
        console.error('OTA error:', e);
      }
    })();
  }, []);
    return <Redirect href="/wallet-init" />;
}
