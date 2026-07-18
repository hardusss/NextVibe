import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import useWalletAddress from '@/hooks/useWalletAddress';
import { CherryChatWebView } from './CherryChatWebView';
import { buildCherryHostHtml } from './cherryHostHtml';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';

// Dynamically load useMobileWallet to avoid static import issues on iOS
let useMobileWallet: any;
try {
  if (Platform.OS === 'android') {
    useMobileWallet = require('@wallet-ui/react-native-web3js/dist/index.native.mjs').useMobileWallet;
  }
} catch (e) {
  console.warn("Failed to load useMobileWallet dynamically:", e);
}

const formatToUuid = (id: string | number | undefined): string => {
  if (!id) return '68a27a2f-f26b-4a84-b8d6-55be5cb86122';
  const strId = String(id);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(strId)) {
    return strId;
  }
  const num = parseInt(strId, 10);
  if (isNaN(num)) {
    return '68a27a2f-f26b-4a84-b8d6-55be5cb86122';
  }
  const hex = num.toString(16);
  const padded = hex.padStart(12, '0');
  return `00000000-0000-0000-0000-${padded}`;
};

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  
  const { address: walletAddress, walletType } = useWalletAddress();
  const mwa = useMobileWallet ? useMobileWallet() : null;
  
  const [token, setToken] = useState<string | null>(null);
  const [cherryRoomId, setCherryRoomId] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  const fetchToken = async (addr: string) => {
    setLoadingToken(true);
    setErrorMsg(null);
    try {
      const apiToken = await storage.getItem('access');
      const response = await axios.post(`${GetApiUrl()}/chat/cherry-embed-token/`, {
        walletAddress: addr,
        chatId: chatId ? parseInt(chatId, 10) : undefined
      }, {
        headers: {
          Authorization: `Bearer ${apiToken}`
        }
      });
      if (response.data?.token) {
        setToken(response.data.token);
        setCherryRoomId(response.data.roomId || '68a27a2f-f26b-4a84-b8d6-55be5cb86122');
      } else {
        setErrorMsg("Failed to retrieve chat token");
      }
    } catch (error: any) {
      console.error('Error fetching cherry embed token:', error);
      setErrorMsg(error?.response?.data?.error || "Error authenticating chat session");
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchToken(walletAddress);
    }
  }, [walletAddress, chatId]);

  const onSign = async (messageBytes: Uint8Array): Promise<Uint8Array> => {
    console.log("[ChatScreen] onSign requested by Cherry, bytes length:", messageBytes.length);
    if (walletType === 'mwa' && mwa) {
      try {
        console.log("[ChatScreen] Launching MWA signature challenge...");
        const signature = await mwa.signMessage(messageBytes);
        if (!signature) {
          throw new Error("Signing rejected by wallet");
        }
        console.log("[ChatScreen] MWA signature acquired.");
        // Slice the last 64 bytes if the signature is appended to the message
        return signature.length > 64 ? signature.slice(-64) : signature;
      } catch (err: any) {
        console.error("[ChatScreen] MWA signing error:", err);
        throw err;
      }
    }
    
    console.log("[ChatScreen] Non-MWA wallet or platform fallback: returning dummy signature");
    // For LazorKit, fallback to a dummy signature
    return new Uint8Array(64);
  };

  const onWalletConnectRequested = () => {
    console.log("[ChatScreen] onWalletConnectRequested triggered from Cherry iframe");
    // Redirect to the wallet introduction/selection screen
    router.push('/wallet-select');
  };

  const hostHtml = buildCherryHostHtml({
    sdkUrl: 'https://embed.cherry.fun/cherry-embed.js'
  });

  const useSignature = walletType === 'mwa' && Platform.OS === 'android' && !!mwa;
  console.log("[ChatScreen] Wallet type:", walletType, "Platform:", Platform.OS, "Use signature flow:", useSignature);

  const config = {
    appId: '16e14376-0fce-4536-8891-754fd8fb5748',
    roomId: cherryRoomId || '68a27a2f-f26b-4a84-b8d6-55be5cb86122',
    mode: 'single' as const,
    theme: { mode: 'dark', primaryColor: '#613583' },
    token: token || undefined,
    walletAddress: useSignature ? (walletAddress || undefined) : undefined,
    embedUrl: 'https://embed.cherry.fun'
  };

  console.log("[ChatScreen] Loading Cherry Chat with Room:", config.roomId, "WalletAddress passed:", config.walletAddress, "Token:", token);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0A0410' : '#fff' }]}>
      <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"} />
      <View style={[styles.navbar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Chat Room</Text>
        </View>
        <View style={styles.rightPlaceholder} />
      </View>

      {!walletAddress ? (
        <View style={styles.center}>
          <Text style={[styles.infoText, { color: isDark ? '#aaa' : '#666' }]}>
            Please connect your wallet to access the chat.
          </Text>
          <TouchableOpacity style={styles.connectButton} onPress={onWalletConnectRequested}>
            <Text style={styles.connectButtonText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={[styles.errorText]}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setErrorMsg(null); fetchToken(walletAddress); }}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (loadingToken || !token) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#613583" />
          <Text style={[styles.infoText, { color: isDark ? '#aaa' : '#666', marginTop: 10 }]}>
            Loading chat session...
          </Text>
        </View>
      ) : (
        <CherryChatWebView
          source={{ html: hostHtml, baseUrl: 'https://embed.cherry.fun' }}
          config={config}
          onSign={onSign}
          onWalletConnectRequested={onWalletConnectRequested}
          style={styles.webview}
          onEvent={(event, data) => {
            console.log(`[CherryChat] Event: ${event}`, data);
            if (event === 'error') {
              console.error("[CherryChat] Error payload:", data);
              const errMsg = data?.message || data?.code || (typeof data === 'string' ? data : JSON.stringify(data)) || "Unknown error";
              setErrorMsg(`Cherry Error: ${errMsg}`);
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 40,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: "Dank Mono Bold",
  },
  rightPlaceholder: {
    width: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: "Dank Mono",
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: "Dank Mono",
  },
  connectButton: {
    backgroundColor: '#FF5BA8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: "Dank Mono Bold",
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: "Dank Mono Bold",
  },
  webview: {
    flex: 1,
  }
});