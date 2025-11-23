import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";

export const WebSocketProvider = ({
  userId,
  children,
}: {
  userId: number;
  children: React.ReactNode;
}) => {
  const wsRef = useRef<WebSocket | null>(null);
  const appState = useRef(AppState.currentState);
  const tokenRef = useRef<string | null>(null);

  const getWebSocketUrl = async (): Promise<string | null> => {
    try {
      const token = await storage.getItem('access');
      if (!token) {
        console.error('❌ No access token found');
        return null;
      }

      tokenRef.current = token;

      const baseUrl = GetApiUrl().split("/api/v1")[0];
      const wsBaseUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .replace(":8000", ":8081");

      const wsUrl = `${wsBaseUrl}/ws?token=${token}`;
      
      console.log('🔌 WebSocket URL:', wsUrl.replace(token, token.substring(0, 20) + '...'));
      return wsUrl;
    } catch (error) {
      console.error('❌ Error getting WebSocket URL:', error);
      return null;
    }
  };

  const connect = async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return;
    }

    const wsUrl = await getWebSocketUrl();
    if (!wsUrl) {
      console.error('❌ Cannot connect: no WebSocket URL');
      return;
    }

    try {
      console.log('🔌 Connecting to WebSocket...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
      };


      ws.onerror = (e: any) => {
        console.error('⚠️ WebSocket error:', e.message);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        wsRef.current = null;

      };
    } catch (error) {
      console.error('❌ WebSocket connection error:', error);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      console.log('👋 Disconnecting WebSocket...');
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    connect();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      console.log('📱 App state changed:', appState.current, '->', nextAppState);
      
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        console.log('📱 App became active, connecting WebSocket...');
        connect();
      } else if (nextAppState.match(/inactive|background/)) {
        console.log('📱 App went to background, disconnecting WebSocket...');
        disconnect();
      }
      
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, [userId]); 

  return <>{children}</>;
};