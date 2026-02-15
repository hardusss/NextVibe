import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TokenAsset } from "@/hooks/usePortfolio";
import TokenItem from "./TokenItem";

interface PortfolioListProps {
  /** Controls dark/light theme styling */
  isDarkMode: boolean;
  /** Determines if token amounts should be masked */
  isBalanceHidden: boolean;
  /** Array of token assets to display */
  tokens: TokenAsset[];
  /** Loading state for skeleton display */
  isLoading: boolean;
}

/**
 * PortfolioList Component
 * * Renders scrollable list of user's token holdings.
 * Handles loading and empty states appropriately.
 */
const PortfolioList: React.FC<PortfolioListProps> = ({
  isDarkMode,
  isBalanceHidden,
  tokens,
  isLoading,
}) => {
  const styles = createStyles(isDarkMode);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
      </View>

      {isLoading ? (
        <SkeletonList styles={styles} />
      ) : tokens.length === 0 ? (
        <EmptyState isDarkMode={isDarkMode} />
      ) : (
        tokens.map((token) => (
          <TokenItem
            key={token.symbol}
            token={token}
            isDarkMode={isDarkMode}
            isBalanceHidden={isBalanceHidden}
          />
        ))
      )}
    </View>
  );
};

// Interface for subcomponents that need access to the computed styles
interface StyleProps {
  styles: ReturnType<typeof createStyles>;
}

/**
 * SkeletonList Subcomponent
 * Renders multiple placeholder rows during loading
 */
const SkeletonList: React.FC<StyleProps> = ({ styles }) => {
  return (
    <>
      {Array(3)
        .fill(null)
        .map((_, index) => (
          <SkeletonItem key={`skeleton-${index}`} styles={styles} />
        ))}
    </>
  );
};

/**
 * SkeletonItem Subcomponent
 * Single animated placeholder row
 */
const SkeletonItem: React.FC<StyleProps> = ({ styles }) => {
  return (
    <View style={styles.skeletonItem}>
      <View style={styles.skeletonLeft}>
        <View style={styles.skeletonIcon} />
        <View>
          <View style={[styles.skeleton, styles.skeletonName]} />
          <View style={[styles.skeleton, styles.skeletonPrice]} />
        </View>
      </View>
      <View style={styles.skeletonRight}>
        <View style={[styles.skeleton, styles.skeletonAmount]} />
        <View style={[styles.skeleton, styles.skeletonValue]} />
      </View>
    </View>
  );
};

/**
 * EmptyState Subcomponent
 * Displays message when portfolio is empty
 */
const EmptyState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const styles = createStyles(isDarkMode);
  
  return (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="wallet-outline"
        size={48}
        color={isDarkMode ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)"}
      />
      <Text style={styles.emptyText}>No assets found</Text>
    </View>
  );
};

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: isDarkMode ? "#FFFFFF" : "#000000",
    },
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
    },
    emptyText: {
      textAlign: "center",
      marginTop: 16,
      fontSize: 16,
      color: isDarkMode
        ? "rgba(255, 255, 255, 0.4)"
        : "rgba(0, 0, 0, 0.4)",
    },
    // --- Skeleton Styles ---
    skeletonItem: {
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
    skeletonLeft: {
      flexDirection: "row",
      alignItems: "center",
    },
    skeletonRight: {
      alignItems: "flex-end",
    },
    // Base skeleton style (background color)
    skeleton: {
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
      borderRadius: 4,
    },
    skeletonIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
      marginRight: 15,
    },
    skeletonName: {
      width: 80,
      height: 16,
      marginBottom: 6,
    },
    skeletonPrice: {
      width: 60,
      height: 13,
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(0, 0, 0, 0.05)",
    },
    skeletonAmount: {
      width: 70,
      height: 16,
      marginBottom: 6,
    },
    skeletonValue: {
      width: 90,
      height: 13,
      backgroundColor: isDarkMode
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(0, 0, 0, 0.05)",
    },
  });

export default PortfolioList;