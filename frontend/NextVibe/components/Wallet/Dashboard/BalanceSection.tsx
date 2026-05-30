import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShimmerSkeleton, AnimatedBalance } from "@/components/Shared/motion";

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

    const decimals = totalBalance > 0 && totalBalance < 0.01 ? 4 : 2;
    const intPart = Math.floor(totalBalance).toLocaleString("en-US");
    const decPart = (totalBalance % 1).toFixed(decimals).slice(1);

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: labelColor }]}>BALANCE</Text>
            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <View style={styles.valueWrapper}>
                {isLoading ? (
                    <ShimmerSkeleton width={200} height={48} borderRadius={12} isDark={isDarkMode} />
                ) : (
                    <AnimatedBalance
                        isHidden={isBalanceHidden}
                        style={styles.valueWrapper}
                        hiddenContent={
                            <Text style={[styles.hidden, { color: mainColor }]}>● ● ● ●</Text>
                        }
                        visibleContent={
                            <View style={styles.amountRow}>
                                <Text style={[styles.currencySign, { color: dimColor }]}>$</Text>
                                <Text style={[styles.intPart, { color: mainColor }]}>{intPart}</Text>
                                <Text style={[styles.decPart, { color: dimColor }]}>{decPart}</Text>
                            </View>
                        }
                    />
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
    valueWrapper: {
        height: 62,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    hidden: {
        fontFamily: "Dank Mono Bold",
        fontSize: 36,
        letterSpacing: 6,
        includeFontPadding: false,
    },
    amountRow: {
        flexDirection: "row",
        alignItems: "flex-end",
    },
    currencySign: {
        fontFamily: "Dank Mono",
        fontSize: 22,
        marginRight: 4,
        marginBottom: 6,
        includeFontPadding: false,
    },
    intPart: {
        fontFamily: "Dank Mono Bold",
        fontSize: 52,
        lineHeight: 62,
        includeFontPadding: false,
    },
    decPart: {
        fontFamily: "Dank Mono",
        fontSize: 22,
        marginBottom: 6,
        includeFontPadding: false,
    },
    bottomRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        width: "60%",
    },
    bottomLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    usdLabel: {
        fontFamily: "Dank Mono",
        fontSize: 10,
        letterSpacing: 2,
        includeFontPadding: false,
    },
});

export default memo(BalanceSection);
