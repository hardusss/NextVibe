import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import GetApiUrl from "../utils/url_api";
export const WebSocketProvider = ({
  userId,
  children,
}: {
  userId: number;
  children: React.ReactNode;
}) => {
  const wsRef = useRef<WebSocket | null>(null);
  const appState = useRef(AppState.currentState);

  const baseUrl = GetApiUrl().split("/api/v1")[0]; 
  const WS_URL = `${baseUrl.replace("http", "ws").replace(":8000", ":8081")}/ws/${userId}`;

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onerror = (e: any) => {
      console.log("⚠️ WebSocket error:", e.message);
      ws.close();
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    connect();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        connect();
      } else if (nextAppState.match(/inactive|background/)) {
        disconnect();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, []);

  return <>{children}</>;
};
