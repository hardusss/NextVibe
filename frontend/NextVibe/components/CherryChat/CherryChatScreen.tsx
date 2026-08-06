import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme, StatusBar } from 'react-native';
import { CherryChatWebView } from './CherryChatWebView';
import { buildCherryHostHtml } from './cherryHostHtml';
import { getCherryEmbedToken } from '@/src/api/chat';
import Header from '../Chat/Header';
import { router } from 'expo-router';

export default function CherryChatScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isDark = useColorScheme() === 'dark';

  const html = useMemo(
    () => buildCherryHostHtml({ sdkUrl: 'https://embed.cherry.fun/cherry-embed.js' }),
    []
  );

  useEffect(() => {
    let isMounted = true;
    const fetchToken = async () => {
      try {
        const freshToken = await getCherryEmbedToken();
        if (isMounted && freshToken) {
          setToken(freshToken);
        }
      } catch (err) {
        console.error('Failed to mint Cherry token:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: '#0F0919' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0919" />
      <Header
        title="NextVibe Community Chat"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />
      {loading || !token ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5BA8" />
          <Text style={styles.loadingText}>Connecting to NextVibe Chat...</Text>
        </View>
      ) : (
        <CherryChatWebView
          source={{ html, baseUrl: 'https://embed.cherry.fun' }}
          config={{
            appId: '16e14376-0fce-4536-8891-754fd8fb5748',
            embedUrl: 'https://embed.cherry.fun',
            roomId: '68a27a2f-f26b-4a84-b8d6-55be5cb86122',
            mode: 'external-controlled',
            token,
            theme: { mode: 'dark', primaryColor: '#FF5BA8' },
          }}
          style={styles.webView}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0919',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#E0E0E0',
    fontSize: 15,
    fontFamily: 'Dank Mono Bold',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0F0919',
  },
});
