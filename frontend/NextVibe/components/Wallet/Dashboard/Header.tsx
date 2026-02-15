import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

interface HeaderProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Current balance visibility state */
  isBalanceHidden: boolean;
  /** Callback to toggle balance visibility */
  onToggleBalance: () => void;
  /** Callback to navigate back */
  onNavigateBack: () => void;
  /** Callback to navigate to transactions screen */
  onNavigateToTransactions: () => void;
}

/**
 * Header Component
 * 
 * Top navigation bar with glassmorphic design.
 * Provides navigation controls and utility actions.
 * 
 * Features:
 * - Back navigation button
 * - Balance visibility toggle
 * - Transactions history access
 * - Blur effect backgrounds
 * - Theme-aware colors
 * 
 * @component
 */
const Header: React.FC<HeaderProps> = ({
  isDarkMode,
  isBalanceHidden,
  onToggleBalance,
  onNavigateBack,
  onNavigateToTransactions,
}) => {
  const styles = createStyles(isDarkMode);
  const iconColor = isDarkMode ? "#A78BFA" : "#5856D6";

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        style={[styles.iconButton, styles.backButton]}
        onPress={onNavigateBack}
      >
        <BlurView
          intensity={isDarkMode ? 40 : 80}
          tint={isDarkMode ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="arrow-back" size={24} color={iconColor} />
      </TouchableOpacity>

      {/* Right Actions Group */}
      <View style={styles.rightGroup}>
        {/* Balance Visibility Toggle */}
        <TouchableOpacity
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={styles.iconButton}
          onPress={onToggleBalance}
        >
          <BlurView
            intensity={isDarkMode ? 40 : 80}
            tint={isDarkMode ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons
            name={isBalanceHidden ? "eye-off-outline" : "eye-outline"}
            size={24}
            color={iconColor}
          />
        </TouchableOpacity>

        {/* Transactions Button */}
        <TouchableOpacity
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={[styles.iconButton, styles.transactionsButton]}
          onPress={onNavigateToTransactions}
        >
          <BlurView
            intensity={isDarkMode ? 40 : 80}
            tint={isDarkMode ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="receipt-outline" size={24} color={iconColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 20,
      marginBottom: 30,
    },
    rightGroup: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconButton: {
      width: 50,
      height: 54,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDarkMode
        ? "rgba(255, 255, 255, 0.15)"
        : "rgba(220, 220, 220, 0.5)",
    },
    backButton: {
      width: 84,
    },
    transactionsButton: {
      marginLeft: 12,
    },
  });

export default Header;