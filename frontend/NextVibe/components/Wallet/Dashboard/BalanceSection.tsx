import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface BalanceSectionProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Determines if balance should be masked */
  isBalanceHidden: boolean;
  /** Total portfolio balance in USD */
  totalBalance: number;
  /** Loading state for skeleton display */
  isLoading: boolean;
}

/**
 * BalanceSection Component
 * 
 * Displays total portfolio balance with optional masking.
 * Shows skeleton loader during data fetch.
 * 
 * Design Decisions:
 * - Large, prominent typography for quick balance check
 * - Letter-spacing optimization for readability
 * - Skeleton matches text dimensions for smooth transition
 * - USD label uses reduced opacity for hierarchy
 * 
 * @component
 */
const BalanceSection: React.FC<BalanceSectionProps> = ({
  isDarkMode,
  isBalanceHidden,
  totalBalance,
  isLoading,
}) => {
  const styles = createStyles(isDarkMode);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Balance</Text>
      
      {isLoading ? (
        <View style={styles.skeleton} />
      ) : (
        <Text style={styles.balance}>
          {isBalanceHidden ? "* * * * * " : `${totalBalance.toFixed(2)} `}
          <Text style={styles.currency}>USD</Text>
        </Text>
      )}
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      fontWeight: "600",
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.7)"
        : "rgba(0, 0, 0, 0.6)",
      marginBottom: 8,
    },
    balance: {
      fontSize: 48,
      fontWeight: "800",
      color: isDarkMode ? "#FFFFFF" : "#000000",
      letterSpacing: -2,
      marginBottom: 4,
    },
    currency: {
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.7)"
        : "rgba(0, 0, 0, 0.6)",
      fontSize: 32,
    },
    skeleton: {
      width: 200,
      height: 48,
      borderRadius: 12,
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
    },
  });

export default BalanceSection;