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
          console.log("⚡ Camera/Flicker detected: Canceling disconnect");
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
        }

        WebSocketService.connect();
      } 
      
      else if (nextAppState.match(/inactive|background/)) {
        // Go to background

        // If timer exist, don't create new
        if (disconnectTimer.current) return;

        console.log("⏳ App background → Scheduling disconnect in 5s...");
        disconnectTimer.current = setTimeout(() => {
          console.log("💤 App background timeout → Disconnecting now");
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