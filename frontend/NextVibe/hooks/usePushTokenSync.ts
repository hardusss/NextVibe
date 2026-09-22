import { useEffect } from "react";
import { AppState } from "react-native";
import { syncPushToken, syncPushTokenIfStale } from "@/src/notifications/pushToken";

/**
 * Keeps this phone's push token registered while someone is signed in: on
 * launch and after every sign-in (email, Google, Apple and wallet sign-in all
 * end with the root layout's userID set), then on foreground once a day.
 */
export function usePushTokenSync(userId: number | null) {
    useEffect(() => {
        if (!userId) return;
        syncPushToken("session");
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") syncPushTokenIfStale();
        });
        return () => subscription.remove();
    }, [userId]);
}
