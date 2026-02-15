import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface DevnetBannerProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
}

/**
 * DevnetBanner Component
 * 
 * Informational banner indicating the app is running on devnet.
 * Provides clear visual distinction from production environment.
 * 
 * Design:
 * - Orange color scheme for attention without alarm
 * - Flask icon for laboratory/testing context
 * - Semi-transparent background for subtlety
 * - Rounded corners matching overall design language
 * 
 * Usage:
 * - Always visible in devnet/testnet mode
 * - Should be removed or hidden in production
 * 
 * @component
 */
const DevnetBanner: React.FC<DevnetBannerProps> = ({ isDarkMode }) => {
  const styles = createStyles(isDarkMode);

  return (
    <View style={styles.container}>
      <Ionicons
        name="flask-outline"
        size={18}
        color={isDarkMode ? "#FFA500" : "#D2691E"}
      />
      <Text style={styles.text}>Devnet Mode</Text>
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 10,
      backgroundColor: isDarkMode
        ? "rgba(255, 165, 0, 0.2)"
        : "rgba(255, 165, 0, 0.3)",
      borderRadius: 12,
      marginHorizontal: 20,
      marginTop: 10,
    },
    text: {
      color: isDarkMode ? "#FFA500" : "#D2691E",
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 8,
    },
  });

export default DevnetBanner;