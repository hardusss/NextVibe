import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'text-encoding'; 

import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import './polyfill';

// Intercept and redirect Solana JSON-RPC WebSockets to public endpoints,
// as the custom RPC/Paymaster proxies do not support WebSocket connections.
const OriginalWebSocket = global.WebSocket;
if (OriginalWebSocket) {
    const CustomWebSocket = function (url, protocols) {
        let targetUrl = typeof url === 'string' ? url : (url && url.toString ? url.toString() : '');
        
        if (
            targetUrl.includes('api.nextvibe.io/api/v1/wallets/rpc') ||
            targetUrl.includes('paymaster.nextvibe.io') ||
            targetUrl.includes('paymaster.lazor.sh')
        ) {
            if (targetUrl.includes('devnet')) {
                targetUrl = 'wss://api.devnet.solana.com';
            } else {
                targetUrl = 'wss://api.mainnet-beta.solana.com';
            }
            console.log(`[WebSocket Redirect] Redirected ${url} to ${targetUrl}`);
        }
        
        return new OriginalWebSocket(targetUrl, protocols);
    };
    
    CustomWebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(CustomWebSocket, OriginalWebSocket);
    global.WebSocket = CustomWebSocket;
}

import 'expo-router/entry';