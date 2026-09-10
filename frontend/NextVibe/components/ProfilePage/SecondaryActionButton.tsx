import React from "react";
import { Text, StyleSheet, useColorScheme } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import PressableButton from "@/components/Shared/PressableButton";
import { space, radius, colors, type as typeScale } from "@/src/theme/tokens";

/**
 * Secondary profile action (Invite, Events): surface fill, 1px border,
 * sub-colored text — visually quieter than the Tap to Meet primary.
 */
export function SecondaryActionButton({
    icon: Icon,
    label,
    onPress,
}: {
    icon: LucideIcon;
    label: string;
    onPress: () => void;
}) {
    const isDark = useColorScheme() === "dark";

    return (
        <PressableButton
            onPress={onPress}
            haptic="light"
            ripple
            style={[
                styles.button,
                isDark
                    ? { backgroundColor: colors.surface, borderColor: colors.border }
                    : { backgroundColor: "rgba(0,0,0,0.03)", borderColor: "rgba(0,0,0,0.08)" },
            ]}
        >
            <Icon size={17} color={isDark ? colors.sub : "rgba(17,24,39,0.64)"} strokeWidth={2} />
            <Text
                style={[styles.label, { color: isDark ? colors.sub : "rgba(17,24,39,0.64)" }]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </PressableButton>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 52,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm - 2,
        overflow: "hidden",
    },
    label: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 2,
        includeFontPadding: false,
    },
});

export default SecondaryActionButton;
