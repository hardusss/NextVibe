import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { FormattedTransaction } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";
import timeAgo from "@/src/utils/formatTime";

interface LastTransactionProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Determines if transaction amounts should be masked */
  isBalanceHidden: boolean;
  /** Most recent transaction data */
  transaction: FormattedTransaction | null;
  /** Current price of transaction token */
  tokenPrice: number;
  /** Loading state for skeleton display */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Callback when card is pressed */
  onPress: () => void;
}

/**
 * LastTransaction Component
 * 
 * Displays most recent wallet transaction in a glassmorphic card.
 * Handles loading, error, and empty states gracefully.
 * 
 * States:
 * - Loading: Shows skeleton loaders
 * - Error: Displays error message with retry option
 * - Empty: Shows "no activity" message
 * - Success: Displays transaction details
 * 
 * Interaction:
 * - Press on error: Triggers refresh
 * - Press on transaction: Navigates to full history
 * - Press on empty: No action
 * 
 * @component
 */
const LastTransaction: React.FC<LastTransactionProps> = ({
  isDarkMode,
  isBalanceHidden,
  transaction,
  tokenPrice,
  isLoading,
  error,
  onPress,
}) => {
  const styles = createStyles(isDarkMode);

  /**
   * Renders content based on current state
   */
  const renderContent = () => {
    if (isLoading) {
      return <LoadingSkeleton isDarkMode={isDarkMode} />;
    }

    if (error) {
      return <ErrorState isDarkMode={isDarkMode} />;
    }

    if (!transaction) {
      return <EmptyState isDarkMode={isDarkMode} />;
    }

    return (
      <TransactionContent
        isDarkMode={isDarkMode}
        isBalanceHidden={isBalanceHidden}
        transaction={transaction}
        tokenPrice={tokenPrice}
      />
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        style={styles.card}
        onPress={onPress}
        disabled={isLoading || (!error && !transaction)}
      >
        <BlurView
          intensity={isDarkMode ? 30 : 40}
          tint={isDarkMode ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>{renderContent()}</View>
      </TouchableOpacity>
    </View>
  );
};

/**
 * TransactionContent Subcomponent
 * Displays transaction details when data is available
 */
const TransactionContent: React.FC<{
  isDarkMode: boolean;
  isBalanceHidden: boolean;
  transaction: FormattedTransaction;
  tokenPrice: number;
}> = ({ isDarkMode, isBalanceHidden, transaction, tokenPrice }) => {
  const styles = createStyles(isDarkMode);
  const tokenKey = transaction.token as keyof typeof TOKENS;
  const tokenInfo = TOKENS[tokenKey];

  const amount = Number(transaction.amount.toFixed(8));
  const usdValue = Number((amount * tokenPrice).toFixed(8));

  return (
    <>
      <View style={styles.iconBackground}>
        <Image
          source={{ uri: tokenInfo.logoURL }}
          style={styles.tokenImage}
        />
      </View>
      
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          {isBalanceHidden
            ? "Recent Transaction"
            : `You ${transaction.type} ${amount} ${transaction.token}`}
        </Text>
        <Text style={styles.details}>
          {isBalanceHidden ? "****" : `~${usdValue} USD`}
        </Text>
      </View>
      
      <Text style={styles.time}>
        {transaction.time ? timeAgo(new Date(transaction.time).toISOString()) : ""}
      </Text>
    </>
  );
};

/**
 * LoadingSkeleton Subcomponent
 * Shows animated placeholders during data fetch
 */
const LoadingSkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const styles = createStyles(isDarkMode);
  
  return (
    <>
      <View style={styles.iconBackground}>
        <View style={[styles.skeleton, styles.skeletonIcon]} />
      </View>
      <View style={styles.textContainer}>
        <View style={[styles.skeleton, styles.skeletonTitle]} />
        <View style={[styles.skeleton, styles.skeletonDetails]} />
      </View>
      <View style={[styles.skeleton, styles.skeletonTime]} />
    </>
  );
};

/**
 * ErrorState Subcomponent
 * Displays error message with icon
 */
const ErrorState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const styles = createStyles(isDarkMode);
  
  return (
    <View style={styles.stateContainer}>
      <Ionicons
        name="alert-circle-outline"
        size={24}
        color={isDarkMode ? "#FF6B6B" : "#E74C3C"}
      />
      <Text style={[styles.stateText, { color: isDarkMode ? "#FF6B6B" : "#E74C3C" }]}>
        Failed to load activity
      </Text>
    </View>
  );
};

/**
 * EmptyState Subcomponent
 * Displays message when no transactions exist
 */
const EmptyState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const styles = createStyles(isDarkMode);
  
  return (
    <View style={styles.stateContainer}>
      <Ionicons
        name="document-text-outline"
        size={24}
        color={isDarkMode ? "#A09CB8" : "#666"}
      />
      <Text style={[styles.stateText, { color: isDarkMode ? "#A09CB8" : "#666" }]}>
        No recent activity
      </Text>
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    card: {
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 0.7,
      borderColor: isDarkMode
        ? "rgba(255, 255, 255, 0.15)"
        : "rgba(220, 220, 220, 0.5)",
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      minHeight: 82,
    },
    iconBackground: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDarkMode
        ? "rgba(167, 139, 250, 0.2)"
        : "rgba(88, 86, 214, 0.15)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 15,
      borderWidth: 1,
      borderColor: isDarkMode
        ? "rgba(167, 139, 250, 0.4)"
        : "rgba(88, 86, 214, 0.3)",
    },
    tokenImage: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: "600",
      color: isDarkMode ? "#FFFFFF" : "#000000",
      marginBottom: 4,
    },
    details: {
      fontSize: 13,
      fontWeight: "500",
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.6)"
        : "rgba(0, 0, 0, 0.5)",
    },
    time: {
      fontSize: 12,
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.4)"
        : "rgba(0, 0, 0, 0.4)",
    },
    stateContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      paddingHorizontal: 10,
      justifyContent: "center",
      flex: 1,
    },
    stateText: {
      fontSize: 16,
      fontWeight: "600",
      marginLeft: 12,
    },
    skeleton: {
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
      borderRadius: 4,
    },
    skeletonIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    skeletonTitle: {
      width: 120,
      height: 16,
      marginBottom: 6,
    },
    skeletonDetails: {
      width: 80,
      height: 13,
    },
    skeletonTime: {
      width: 50,
      height: 12,
    },
  });

export default LastTransaction;