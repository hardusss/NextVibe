import React, { useEffect, useRef } from "react";
import { View, useColorScheme } from "react-native";
import { useRouter } from "expo-router";

import CustomActivityIndicator from "@/components/CustomActivityIndicator";
import { intentFromUrl } from "@/src/navigation/intents";
import { setPendingIntent } from "@/src/navigation/pendingIntent";
import { colors } from "@/src/theme/tokens";

/**
 * nextvibe.io/u/meets navigated to inside the app (system links and pushes
 * go through the pending-intent gate directly). Hands the same intent to the
 * gate, which opens your profile with POAPs & History.
 */
export default function MeetsLinkScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        handled.current = true;
        const intent = intentFromUrl("/u/meets", false, Date.now());
        if (router.canGoBack()) router.back();
        else router.replace("/home");
        if (intent) setPendingIntent(intent);
    }, [router]);

    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: isDark ? colors.bg : "#FFFFFF" }}>
            <CustomActivityIndicator size="large" />
        </View>
    );
}
