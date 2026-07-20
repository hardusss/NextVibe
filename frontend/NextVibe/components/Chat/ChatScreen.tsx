import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  StyleSheet,
  StatusBar,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CherryChatWebView } from './CherryChatWebView';
import { buildCherryHostHtml } from './cherryHostHtml';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';

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

  const [token, setToken] = useState<string | null>(null);
  const [cherryRoomId, setCherryRoomId] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  // App-trusted mode: the backend derives the wallet from the authenticated
  // session — we only send our API access token. No walletAddress in body.
  const fetchToken = async () => {
    setLoadingToken(true);
    setErrorMsg(null);
    try {
      const apiToken = await storage.getItem('access');
      const response = await axios.post(
        `${GetApiUrl()}/chat/cherry-embed-token/`,
        chatId ? { chatId: parseInt(chatId, 10) } : {},
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );
      if (response.data?.token) {
        setToken(response.data.token);
        setCherryRoomId(response.data.roomId || '68a27a2f-f26b-4a84-b8d6-55be5cb86122');
        console.log('[ChatScreen] Token received, roomId:', response.data.roomId);
      } else {
        setErrorMsg('Failed to retrieve chat token');
      }
    } catch (error: any) {
      console.error('[ChatScreen] Error fetching cherry embed token:', error?.response?.data || error);
      setErrorMsg(error?.response?.data?.error || 'Error authenticating chat session');
    } finally {
      setLoadingToken(false);
    }
  };

  // Fetch immediately on mount — no wallet dependency
  useEffect(() => {
    fetchToken();
  }, [chatId]);

  const hostHtml = useMemo(() => buildCherryHostHtml({
    sdkUrl: 'https://embed.cherry.fun/cherry-embed.js'
  }), []);

  const webViewSource = useMemo(() => ({
    html: hostHtml,
    baseUrl: 'https://nextvibe.io'
  }), [hostHtml]);

  const config = useMemo(() => ({
    appId: '16e14376-0fce-4536-8891-754fd8fb5748',
    roomId: cherryRoomId || '68a27a2f-f26b-4a84-b8d6-55be5cb86122',
    mode: 'single' as const,
    theme: { mode: 'dark' as const, primaryColor: '#FF5BA8' },
    token: token || undefined,
    embedUrl: 'https://embed.cherry.fun',
  }), [token, cherryRoomId]);

  console.log('[ChatScreen] Config — Room:', config.roomId, 'Token present:', !!token);

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

      {errorMsg ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setErrorMsg(null); fetchToken(); }}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (loadingToken || !token || !cherryRoomId) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5BA8" />
          <Text style={[styles.infoText, { color: isDark ? '#aaa' : '#666', marginTop: 10 }]}>
            Loading chat session...
          </Text>
        </View>
      ) : (
        // App-trusted mode: no onSign, no onWalletConnectRequested — the token alone authenticates.
        <CherryChatWebView
          source={webViewSource}
          config={config}
          style={styles.webview}
          onEvent={(event, data) => {
            console.log(`[CherryChat] Event: ${event}`, data);
            if (event === 'error') {
              console.error('[CherryChat] Error payload:', data);
              const errData = data as any;
              const errMsg = errData?.message || errData?.code || (typeof data === 'string' ? data : JSON.stringify(data)) || 'Unknown error';
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