import React, { useRef, useEffect } from "react";
import { View, Text, Image, StyleSheet, Animated } from "react-native";
import { TokenAsset } from "@/hooks/usePortfolio";
import { TrendingUp, TrendingDown, Minus } from "lucide-react-native";

interface TokenItemProps {
    token: TokenAsset;
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    isLast?: boolean;
    index?: number;
}

const TokenItem: React.FC<TokenItemProps> = React.memo(
    ({ token, isDarkMode, isBalanceHidden, isLast = false, index = 0 }) => {
        // Staggered entrance animation
        const fadeAnim = useRef(new Animated.Value(0)).current;
        const slideAnim = useRef(new Animated.Value(24)).current;
        const scaleAnim = useRef(new Animated.Value(0.95)).current;

        useEffect(() => {
            const delay = index * 80;
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 420,
                    delay,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 70,
                    friction: 11,
                    delay,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 70,
                    friction: 11,
                    delay,
                    useNativeDriver: true,
                }),
            ]).start();
        }, []);

        // Colors
        const cardBg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)";
        const cardBorder = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const mainColor = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)";
        const symbolColor = isDarkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
        const mutedColor = isDarkMode ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
        const logoBg = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

        const isUp = token.direction === "up";
        const isDown = token.direction === "down";

        const changeColor = isUp
            ? isDarkMode ? "#6ee7b7" : "#059669"
            : isDown
                ? isDarkMode ? "#fca5a5" : "#dc2626"
                : mutedColor;

        const changeBg = isUp
            ? isDarkMode ? "rgba(110,231,183,0.1)" : "rgba(5,150,105,0.08)"
            : isDown
                ? isDarkMode ? "rgba(252,165,165,0.1)" : "rgba(220,38,38,0.08)"
                : isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";

        const changeSign = isUp ? "+" : "";

        const formatAmount = (amount: number): string => {
            if (amount >= 1000) return amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            if (amount >= 1) return amount.toFixed(2);
            if (amount >= 0.001) return amount.toFixed(4);
            return amount.toFixed(8).replace(/\.?0+$/, "");
        };

        const formatValue = (value: number): string => {
            if (value >= 1000) return `$${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
            if (value >= 1) return `$${value.toFixed(2)}`;
            return `$${value.toFixed(4)}`;
        };

        const ChangeIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

        return (
            <Animated.View
                style={[
                    styles.container,
                    {
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                        marginBottom: isLast ? 0 : 5,
                    },
                    {
                        opacity: fadeAnim,
                        transform: [
                            { translateY: slideAnim },
                            { scale: scaleAnim },
                        ],
                    },
                ]}
            >
                {/* Logo */}
                <View style={styles.logoContainer}>
                    {token.logoURI ? (
                        <Image source={{ uri: token.logoURI }} style={styles.logo} />
                    ) : (
                        <View style={[styles.logo, { backgroundColor: logoBg }]}>
                            <Text style={[styles.logoFallback, { color: symbolColor }]}>
                                {token.symbol.charAt(0)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Info column */}
                <View style={styles.info}>
                    <View style={styles.nameRow}>
                        <Text style={[styles.name, { color: mainColor }]} numberOfLines={1}>
                            {token.name}
                        </Text>
                        <Text style={[styles.symbol, { color: symbolColor }]}>
                            {token.symbol}
                        </Text>
                    </View>

                    <View style={styles.priceRow}>
                        <Text style={[styles.price, { color: mutedColor }]}>
                            ${token.price >= 1 ? token.price.toFixed(2) : token.price.toFixed(4)}
                        </Text>

                        {/* Change pill */}
                        <View style={[styles.changePill, { backgroundColor: changeBg }]}>
                            <ChangeIcon size={9} color={changeColor} strokeWidth={2} />
                            <Text style={[styles.changeText, { color: changeColor }]}>
                                {isBalanceHidden ? "••" : `${changeSign}${token.change24h.toFixed(2)}%`}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Value column */}
                <View style={styles.right}>
                    <Text style={[styles.value, { color: mainColor }]}>
                        {isBalanceHidden ? "••••" : formatValue(token.valueUsd)}
                    </Text>
                    <Text style={[styles.amount, { color: mutedColor }]}>
                        {isBalanceHidden ? "••" : `${formatAmount(token.amount)} ${token.symbol}`}
                    </Text>
                </View>
            </Animated.View>
        );
    },
    (prev, next) =>
        prev.token.symbol === next.token.symbol &&
        prev.token.amount === next.token.amount &&
        prev.token.price === next.token.price &&
        prev.isBalanceHidden === next.isBalanceHidden &&
        prev.isDarkMode === next.isDarkMode &&
        prev.token.change24h === next.token.change24h &&
        prev.token.direction === next.token.direction &&
        prev.index === next.index
);

TokenItem.displayName = "TokenItem";

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
    },

    // Logo
    logoContainer: {
        marginRight: 10,
    },
    logo: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
    },
    logoFallback: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },

    // Info
    info: {
        flex: 1,
        marginRight: 8,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    name: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13.5,
        includeFontPadding: false,
        flexShrink: 1,
    },
    symbol: {
        fontFamily: "Dank Mono",
        fontSize: 10.5,
        includeFontPadding: false,
    },

    // Price row
    priceRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 3,
    },
    price: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },

    // Change pill
    changePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 6,
    },
    changeText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 9.5,
        includeFontPadding: false,
    },

    // Right (value)
    right: {
        alignItems: "flex-end",
    },
    value: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13.5,
        includeFontPadding: false,
    },
    amount: {
        fontFamily: "Dank Mono",
        fontSize: 10.5,
        includeFontPadding: false,
        marginTop: 3,
    },
});

export default TokenItem;