import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, X } from "lucide-react-native";

import { LANDING_POLL_MS, useCollectibles } from "@/src/stores/collectiblesStore";
import { useConnectWallet } from "@/src/stores/connectWalletStore";
import { landingText } from "@/src/utils/collectibles";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

const DONE_VISIBLE_MS = 5000;
/** Above the tab bar */
const BOTTOM_OFFSET = 96;

/**
 * "Putting 7 collectibles on Solana… 3 of 7" after a wallet connect made
 * anywhere but the connect sheet (which shows it itself): the wallet
 * screen, the passkey flow. Keeps asking the server while it lasts, so it
 * moves even if a socket event is missed. Mounted once in the root layout.
 */
export default function CollectiblesLanding() {
    const landing = useCollectibles((s) => s.landing);
    const sheetOpen = useConnectWallet((s) => s.reason !== null);
    const isDark = useColorScheme() === "dark";
    const insets = useSafeAreaInsets();
    const reduceMotion = useReduceMotion();

    const active = !!landing && !landing.done;
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => useCollectibles.getState().refreshSummary(), LANDING_POLL_MS);
        return () => clearInterval(timer);
    }, [active]);

    useEffect(() => {
        if (!landing?.done || sheetOpen) return;
        const timer = setTimeout(() => useCollectibles.getState().clearLanding(), DONE_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [landing?.done, sheetOpen]);

    if (!landing || sheetOpen) return null;
    const done = landing.done;
    const sub = done && landing.waiting > 0
        ? `${landing.landed} landed, ${landing.waiting} will retry automatically.`
        : `${landing.landed} of ${landing.total} on Solana`;

    return (
        <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(220)}
            exiting={reduceMotion ? undefined : FadeOutDown.duration(180)}
            style={[styles.wrap, { bottom: insets.bottom + BOTTOM_OFFSET }]}
            pointerEvents="box-none"
        >
            <View style={[styles.card, {
                backgroundColor: isDark ? "#1a0f2e" : "#FFFFFF",
                borderColor: isDark ? "rgba(168,85,247,0.35)" : "rgba(124,58,237,0.2)",
            }]} accessibilityLiveRegion="polite">
                {done ? <CheckCircle2 size={22} color={colors.success} /> : <ActivityIndicator size="small" color={colors.accent} />}
                <View style={styles.texts}>
                    <Text style={[styles.title, { color: isDark ? colors.text : "#111827" }]} numberOfLines={1}>
                        {landingText(landing.total, landing.landed)}
                    </Text>
                    <Text style={[styles.sub, { color: isDark ? colors.sub : "rgba(17,24,39,0.6)" }]} numberOfLines={1}>{sub}</Text>
                </View>
                {done && (
                    <Pressable onPress={() => useCollectibles.getState().clearLanding()} hitSlop={10} accessibilityLabel="Close">
                        <X size={18} color={isDark ? colors.muted : "rgba(17,24,39,0.45)"} />
                    </Pressable>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        left: space.lg,
        right: space.lg,
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    texts: {
        flex: 1,
        gap: 2,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    sub: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
});
