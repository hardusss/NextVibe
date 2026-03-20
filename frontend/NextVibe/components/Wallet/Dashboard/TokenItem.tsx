import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { TokenAsset } from "@/hooks/usePortfolio";

interface TokenItemProps {
    token: TokenAsset;
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    isLast?: boolean;
}

const TokenItem: React.FC<TokenItemProps> = React.memo(
    ({ token, isDarkMode, isBalanceHidden, isLast = false }) => {
        const mainColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
        const mutedColor = isDarkMode ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
        const dividerColor = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";

        const changeColor =
            token.direction === "up"
                ? "#4ade80"
                : token.direction === "down"
                    ? "#f87171"
                    : mutedColor;

        const changeSign = token.direction === "up" ? "+" : "";

        const formatAmount = (amount: number): string => {
            if (amount >= 1) return amount.toFixed(2);
            return amount.toFixed(8).replace(/\.?0+$/, "");
        };

        return (
            <View style={[
                styles.container,
                !isLast && { borderBottomWidth: 1, borderBottomColor: dividerColor },
            ]}>
                {/* Logo */}
                {token.logoURI ? (
                    <Image source={{ uri: token.logoURI }} style={styles.logo} />
                ) : (
                    <View style={[styles.logo, { backgroundColor: dividerColor }]} />
                )}

                {/* Info */}
                <View style={styles.priceRow}>
                    <Text style={[styles.price, { color: mutedColor }]}>
                        ${token.price.toFixed(2)} / {token.symbol}
                    </Text>
                    <Text style={[styles.change, { color: changeColor }]}>
                        {isBalanceHidden ? "••" : `${changeSign}${token.change24h.toFixed(2)}%`}
                    </Text>
                </View>

                {/* Value */}
                <View style={styles.right}>
                    <Text style={[styles.value, { color: mainColor }]}>
                        {isBalanceHidden ? "••••" : `$${token.valueUsd.toFixed(2)}`}
                    </Text>
                    <Text style={[styles.amount, { color: mutedColor }]}>
                        {isBalanceHidden ? "••" : formatAmount(token.amount)}
                    </Text>
                </View>
            </View>
        );
    },
    (prev, next) =>
        prev.token.symbol === next.token.symbol &&
        prev.token.amount === next.token.amount &&
        prev.token.price === next.token.price &&
        prev.isBalanceHidden === next.isBalanceHidden &&
        prev.isDarkMode === next.isDarkMode &&
        prev.token.change24h === next.token.change24h &&
        prev.token.direction === next.token.direction
);

TokenItem.displayName = "TokenItem";

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    logo: {
        width: 38,
        height: 38,
        borderRadius: 19,
        marginRight: 12,
    },
    info: {
        flex: 1,
    },
    name: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    price: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
        marginTop: 3,
    },
    right: {
        alignItems: "flex-end",
    },
    value: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    amount: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
        marginTop: 3,
    },
    priceRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 3,
    },
    change: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
});

export default TokenItem;