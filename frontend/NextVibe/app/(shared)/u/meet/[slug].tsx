import React, { useEffect, useRef } from "react";
import { View, useColorScheme } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import CustomActivityIndicator from "@/components/CustomActivityIndicator";
import { openMeetSheet } from "@/src/stores/meetSheetStore";
import { colors } from "@/src/theme/tokens";

/**
 * nextvibe.io/u/meet/<slug> navigated to inside the app. System links never
 * get here: +native-intent hands them to the pending-intent gate, which
 * opens the meet sheet once the app is ready. This one opens the sheet
 * right away and steps out of the way.
 */
export default function MeetLinkScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        handled.current = true;
        if (router.canGoBack()) router.back();
        else router.replace("/home");
        if (slug) openMeetSheet(String(slug), "link");
    }, [slug, router]);

    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: isDark ? colors.bg : "#FFFFFF" }}>
            <CustomActivityIndicator size="large" />
        </View>
    );
}
