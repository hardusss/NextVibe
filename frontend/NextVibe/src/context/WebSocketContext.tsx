import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";

let ws: WebSocket | null = null;  // GLOBAL SOCKET

export const WebSocketProvider = ({
  userId,
  children,
}: {
  userId: number;
  children: React.ReactNode;
}) => {
  const appState = useRef(AppState.currentState);

  const getWebSocketUrl = async (): Promise<string | null> => {
    try {
      const token = await storage.getItem("access");
      if (!token) {
        console.error("❌ No access token found");
        return null;
      }

      const baseUrl = GetApiUrl().split("/api/v1")[0];
      const wsBaseUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .replace(":8000", ":8081");

      const wsUrl = `${wsBaseUrl}/ws?token=${token}`;
      console.log("🔌 WS URL:", wsUrl.replace(token, token.substring(0, 20) + "..."));

      return wsUrl;
    } catch (error) {
      console.error("❌ Error building WS URL:", error);
      return null;
    }
  };

  const connect = async () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.log("⚠️ WebSocket already active");
      return;
    }

    const wsUrl = await getWebSocketUrl();
    if (!wsUrl) return;

    console.log("🔌 Connecting WebSocket...");
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
    };

    ws.onerror = (e: any) => {
      console.error("⚠️ WebSocket error:", e?.message);
    };

    ws.onclose = (event) => {
      console.log(
        `🔌 WebSocket closed (code: ${event.code}, reason: ${event.reason || "none"})`
      );
      ws = null; 
    };
  };

  const disconnect = () => {
    if (ws) {
      console.log("👋 Closing WebSocket...");
      ws.close();
      ws = null;
    }
  };

  useEffect(() => {
    connect(); 

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      console.log("📱 App state:", appState.current, "->", nextAppState);

      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("📱 App active → reconnecting WS");
        connect();
      }

      if (nextAppState.match(/inactive|background/)) {
        console.log("📱 App background → disconnect WS");
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
