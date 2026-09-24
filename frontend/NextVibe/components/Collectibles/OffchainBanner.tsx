import React from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Layers, X } from "lucide-react-native";

import { useCollectibles } from "@/src/stores/collectiblesStore";
import { openConnectWallet } from "@/src/stores/connectWalletStore";
import { bannerSnoozed, savedOffchainText } from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

/**
 * On your own profile, above the tabs, while anything of yours is saved
 * off-chain and you have no wallet: "3 collectibles saved off-chain ·
 * Connect wallet". "Not now" hides it for 7 days. Never a modal.
 */
export default function OffchainBanner() {
    const summary = useCollectibles((s) => s.summary);
    const dismissedAt = useCollectibles((s) => s.bannerDismissedAt);
    const isDark = useColorScheme() === "dark";

    const count = summary ? summary.offchain + summary.failed : 0;
    if (!summary || summary.has_wallet || count === 0 || bannerSnoozed(dismissedAt, Date.now())) return null;

    return (
        <View
            style={[styles.banner, {
                backgroundColor: isDark ? "rgba(168,85,247,0.1)" : "rgba(124,58,237,0.06)",
                borderColor: isDark ? "rgba(168,85,247,0.3)" : "rgba(124,58,237,0.18)",
            }]}
            testID="offchain-banner"
        >
            <Layers size={18} color={isDark ? "#d8b4fe" : colors.accentDeep} />
            <Text style={[styles.text, { color: isDark ? colors.text : "#111827" }]} numberOfLines={2}>
                {savedOffchainText(count)}
            </Text>
            <Pressable
                onPress={() => { haptics.impact("light"); openConnectWallet("banner"); }}
                style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.8 : 1 }]}
                hitSlop={6}
                accessibilityRole="button"
            >
                <Text style={styles.ctaText}>Connect wallet</Text>
            </Pressable>
            <Pressable
                onPress={() => { haptics.selection(); useCollectibles.getState().dismissBanner(); }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Not now"
            >
                <X size={16} color={isDark ? colors.muted : "rgba(17,24,39,0.4)"} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        marginTop: space.md,
        paddingLeft: space.md,
        paddingRight: space.sm,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        borderWidth: 1,
    },
    text: {
        flex: 1,
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption + 1,
        includeFontPadding: false,
    },
    cta: {
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.sm,
        backgroundColor: colors.accent,
    },
    ctaText: {
        color: "#FFFFFF",
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
});
