import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface BalanceSectionProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    totalBalance: number;
    isLoading: boolean;
}

const BalanceSection: React.FC<BalanceSectionProps> = ({
    isDarkMode,
    isBalanceHidden,
    totalBalance,
    isLoading,
}) => {
    const labelColor = isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)";
    const mainColor = isDarkMode ? "#FFFFFF" : "#000000";
    const dimColor = isDarkMode ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
    const borderColor = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
    const skBg = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

    const intPart = Math.floor(totalBalance).toLocaleString("en-US");
    const decPart = (totalBalance % 1).toFixed(2).slice(1);

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: labelColor }]}>BALANCE</Text>
            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            {/* Fixed height wrapper — prevents layout shift on toggle */}
            <View style={styles.valueWrapper}>
                {isLoading ? (
                    <View style={[styles.skeleton, { backgroundColor: skBg }]} />
                ) : isBalanceHidden ? (
                    <Text style={[styles.hidden, { color: mainColor }]}>● ● ● ●</Text>
                ) : (
                    <View style={styles.amountRow}>
                        <Text style={[styles.currencySign, { color: dimColor }]}>$</Text>
                        <Text style={[styles.intPart, { color: mainColor }]}>{intPart}</Text>
                        <Text style={[styles.decPart, { color: dimColor }]}>{decPart}</Text>
                    </View>
                )}
            </View>

            <View style={styles.bottomRow}>
                <View style={[styles.bottomLine, { backgroundColor: borderColor }]} />
                <Text style={[styles.usdLabel, { color: dimColor }]}>USD</Text>
                <View style={[styles.bottomLine, { backgroundColor: borderColor }]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    label: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        letterSpacing: 3,
        marginBottom: 14,
    },
    divider: {
        width: 32,
        height: 1,
        borderRadius: 1,
        marginBottom: 16,
    },
    // Fixed height = intPart lineHeight (62) — same for all states
    valueWrapper: {
        height: 62,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    amountRow: {
        flexDirection: "row",
        alignItems: "flex-end",
    },
    currencySign: {
        fontFamily: "Dank Mono",
        fontSize: 28,
        includeFontPadding: false,
        lineHeight: 52,
        marginRight: 2,
    },
    intPart: {
        fontFamily: "Dank Mono",
        fontSize: 58,
        includeFontPadding: false,
        letterSpacing: -3,
        lineHeight: 62,
    },
    decPart: {
        fontFamily: "Dank Mono",
        fontSize: 24,
        includeFontPadding: false,
        lineHeight: 40,
        marginBottom: 6,
        letterSpacing: -1,
    },
    hidden: {
        fontFamily: "Dank Mono",
        fontSize: 32,
        letterSpacing: 8,
    },
    skeleton: {
        width: 220,
        height: 48,
        borderRadius: 12,
    },
    bottomRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    bottomLine: {
        flex: 1,
        height: 1,
        borderRadius: 1,
    },
    usdLabel: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        letterSpacing: 3,
    },
});

export default BalanceSection;