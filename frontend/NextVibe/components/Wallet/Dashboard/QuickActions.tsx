import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

interface QuickActionsProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Callback for receive action */
  onReceive: () => void;
  /** Callback for send action */
  onSend: () => void;
  /** Callback for swap action */
  onSwap: () => void;
}

interface ActionButtonData {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

/**
 * QuickActions Component
 * 
 * Horizontal row of primary wallet actions.
 * Uses glassmorphic buttons with consistent spacing.
 * 
 * Actions:
 * - Receive: Navigate to deposit screen
 * - Send: Navigate to token selection for sending
 * - Swap: Shows coming soon notification
 * 
 * Design:
 * - Equal spacing for visual balance
 * - Icon-first design for quick recognition
 * - Blur backgrounds for depth
 * - Subtle borders for definition
 * 
 * @component
 */
const QuickActions: React.FC<QuickActionsProps> = ({
  isDarkMode,
  onReceive,
  onSend,
  onSwap,
}) => {
  const styles = createStyles(isDarkMode);
  const iconColor = isDarkMode ? "#A78BFA" : "#5856D6";

  const actions: ActionButtonData[] = [
    {
      id: "receive",
      icon: "arrow-down-outline",
      label: "Receive",
      onPress: onReceive,
    },
    {
      id: "send",
      icon: "arrow-up-outline",
      label: "Send",
      onPress: onSend,
    },
    {
      id: "swap",
      icon: "swap-horizontal-outline",
      label: "Swap",
      onPress: onSwap,
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <View key={action.id} style={styles.actionWrapper}>
          <TouchableOpacity
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.actionButton}
            onPress={action.onPress}
          >
            <BlurView
              intensity={isDarkMode ? 40 : 40}
              tint={isDarkMode ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={action.icon} size={26} color={iconColor} />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </View>
      ))}
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingHorizontal: 10,
      marginBottom: 30,
    },
    actionWrapper: {
      alignItems: "center",
    },
    actionButton: {
      width: 82,
      height: 72,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
      overflow: "hidden",
      borderWidth: 0.7,
      borderColor: isDarkMode
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(220, 220, 220, 0.5)",
    },
    actionLabel: {
      color: isDarkMode ? "#FFFFFF" : "#000000",
      fontSize: 14,
      fontWeight: "600",
    },
  });

export default QuickActions;