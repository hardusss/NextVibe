import React from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import { openConnectWallet, type ConnectWalletReason } from "@/src/stores/connectWalletStore";
import { SAVED_NOTE } from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

/**
 * Under a check-in or a tap for someone without a wallet: it's saved to the
 * profile, a wallet can come later. A quiet secondary button, never a modal.
 */
export default function SavedOffchainNote({ reason, onBeforeOpen }: {
    reason: ConnectWalletReason;
    /** A sheet showing this closes first, so the connect sheet isn't under it */
    onBeforeOpen?: () => void;
}) {
    const isDark = useColorScheme() === "dark";
    return (
        <View style={styles.wrap} testID="saved-offchain-note">
            <Text style={[styles.text, { color: isDark ? colors.sub : "rgba(17,24,39,0.62)" }]}>{SAVED_NOTE}</Text>
            <Pressable
                onPress={() => {
                    haptics.impact("light");
                    onBeforeOpen?.();
                    openConnectWallet(reason);
                }}
                style={({ pressed }) => [styles.button, {
                    borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.14)",
                    opacity: pressed ? 0.75 : 1,
                }]}
                hitSlop={6}
                accessibilityRole="button"
            >
                <Text style={[styles.buttonText, { color: isDark ? colors.text : "#111827" }]}>Connect wallet</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: "center",
        gap: space.sm,
        paddingHorizontal: space.lg,
    },
    text: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption + 1,
        lineHeight: 19,
        textAlign: "center",
        includeFontPadding: false,
    },
    button: {
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    buttonText: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption + 1,
        includeFontPadding: false,
    },
});
