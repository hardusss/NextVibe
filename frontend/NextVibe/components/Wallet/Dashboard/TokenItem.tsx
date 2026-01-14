import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { TokenAsset } from "@/hooks/usePortfolio";

interface TokenItemProps {
  /** Token data to display */
  token: TokenAsset;
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Determines if amounts should be masked */
  isBalanceHidden: boolean;
}

/**
 * TokenItem Component
 * 
 * Single row displaying token information in portfolio list.
 * Memoized for performance optimization.
 * 
 * Display Logic:
 * - Large amounts (≥1): Shows 2 decimal places
 * - Small amounts (<1): Shows up to 8 decimals, removes trailing zeros
 * - Hidden state: Shows asterisks for privacy
 * 
 * Layout:
 * - Left: Token logo + name + current price
 * - Right: Amount held + USD value
 * 
 * @component
 */
const TokenItem: React.FC<TokenItemProps> = React.memo(
  ({ token, isDarkMode, isBalanceHidden }) => {
    const styles = createStyles(isDarkMode);

    /**
     * Formats token amount for display
     * Large amounts show 2 decimals, small amounts show up to 8
     */
    const formatAmount = (amount: number): string => {
      if (amount >= 1) {
        return amount.toFixed(2);
      }
      // Remove trailing zeros from small amounts
      return amount.toFixed(8).replace(/\.?0+$/, "");
    };

    return (
      <View style={styles.container}>
        {/* Left Side: Logo and Token Info */}
        <View style={styles.leftSection}>
          {token.logoURI ? (
            <Image source={{ uri: token.logoURI }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]} />
          )}

          <View style={styles.tokenInfo}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <Text style={styles.tokenPrice}>
              {token.symbol} ${token.price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Right Side: Amount and Value */}
        <View style={styles.rightSection}>
          <Text style={styles.amount}>
            {isBalanceHidden ? "****" : formatAmount(token.amount)}
          </Text>
          <Text style={styles.value}>
            {isBalanceHidden ? "****" : `$${token.valueUsd.toFixed(2)}`}
          </Text>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for memo optimization
    // Re-render only if these props change
    return (
      prevProps.token.symbol === nextProps.token.symbol &&
      prevProps.token.amount === nextProps.token.amount &&
      prevProps.token.price === nextProps.token.price &&
      prevProps.isBalanceHidden === nextProps.isBalanceHidden &&
      prevProps.isDarkMode === nextProps.isDarkMode
    );
  }
);

TokenItem.displayName = "TokenItem";

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderBottomWidth: 0.5,
      borderBottomColor: isDarkMode
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.08)",
    },
    leftSection: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    logo: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 15,
    },
    logoFallback: {
      backgroundColor: "#ddd",
    },
    tokenInfo: {
      flexDirection: "column",
    },
    tokenName: {
      fontSize: 16,
      fontWeight: "600",
      color: isDarkMode ? "#FFFFFF" : "#000000",
    },
    tokenPrice: {
      fontSize: 13,
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.6)"
        : "rgba(0, 0, 0, 0.5)",
      marginTop: 2,
    },
    rightSection: {
      alignItems: "flex-end",
    },
    amount: {
      fontSize: 16,
      fontWeight: "600",
      color: isDarkMode ? "#FFFFFF" : "#000000",
    },
    value: {
      fontSize: 13,
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.6)"
        : "rgba(0, 0, 0, 0.5)",
      marginTop: 2,
    },
  });

export default TokenItem;