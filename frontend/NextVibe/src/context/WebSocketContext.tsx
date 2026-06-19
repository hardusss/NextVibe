import React, { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import WebSocketService from "../services/WebSocketService"; 

export const WebSocketProvider = ({
  userId,
  children,
}: {
  userId: number | null;
  children: React.ReactNode;
}) => {
  const appState = useRef(AppState.currentState);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Fitst connect
    WebSocketService.connect();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {

      if (nextAppState === "active") {
        if (disconnectTimer.current) {
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
        }

        // Reconnect only if WebSocket actually closed
        if (WebSocketService.getReadyState() !== WebSocket.OPEN) {
          WebSocketService.connect();
        }
      } 
      
      else if (nextAppState.match(/inactive|background/)) {
        // Go to background

        // If timer exist, don't create new
        if (disconnectTimer.current) return;

        disconnectTimer.current = setTimeout(() => {
          WebSocketService.disconnect();
          disconnectTimer.current = null;
        }, 5000); // time delay 5 seconds
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      subscription.remove();
      WebSocketService.disconnect();
    };
  }, [userId]);

  return <>{children}</>;
};