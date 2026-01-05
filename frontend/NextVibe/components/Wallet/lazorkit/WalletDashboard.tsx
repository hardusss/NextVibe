import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Image,
    useColorScheme,
    StatusBar,
} from "react-native";
import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import usePortfolio, { TokenAsset } from "@/hooks/usePortfolio";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";

/**
 * Shortens a wallet address to a readable format
 * @param address - Full wallet address string
 * @returns Shortened address in format "0x12...abcd"
 * @example
 * shortenAddress("0x1234567890abcdef") // Returns "0x12...cdef"
 */
const shortenAddress = (address: string): string => {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
};


/**
 * WalletDashboard Component
 * 
 * Main wallet interface displaying user's token portfolio with glassmorphic UI.
 * Matches the visual style of WalletScreen but uses the LazorKit wallet adapter.
 * 
 * Features:
 * - Total balance display with hide/show toggle
 * - Token portfolio list with live data
 * - Quick action buttons (Receive, Send, Swap)
 * - Pull-to-refresh functionality
 * - Responsive to system theme (dark/light mode)
 * - Glassmorphism effects using BlurView
 * - Gradient backgrounds
 * 
 * Data Flow:
 * 1. useWallet provides wallet connection and public key
 * 2. usePortfolio fetches and manages token balances
 * 3. User can manually refresh via pull-to-refresh
 * 4. All quick actions show "In next update..." toast
 * 
 * @component
 * @example
 * <WalletDashboard />
 */
export default function WalletDashboard() {
    
    /** System color scheme for theme-aware styling */
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === "dark";
    
    /** Navigation router for screen transitions */
    const router = useRouter();
    
    /** Wallet connection context from LazorKit */
    const { smartWalletPubkey } = useWallet();
    
    /** Portfolio data and refresh function from custom hook */
    const { data, isLoading, refresh } = usePortfolio();
    
    /** Controls visibility of balance and amounts */
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);
    
    /** Controls manual refresh indicator (pull-to-refresh) */
    const [refreshing, setRefreshing] = useState(false);
    
    /** Toast visibility for feature coming soon messages */
    const [isToastVisible, setIsToastVisible] = useState(false);
    
    /**
     * Handles pull-to-refresh action
     * Triggers portfolio data refresh and manages loading state
     * 
     * @async
     */
    const onRefresh = async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    };
    
    /**
     * Shows toast notification for features under development
     * Used for all quick action buttons (Receive, Send, Swap)
     */
    const showComingSoonToast = () => {
        setIsToastVisible(true);
    };
    
    /**
     * Renders a single token item in the portfolio list
     * Displays token icon, name, amount, price, and USD value
     * 
     * @param item - Token asset data
     * @param index - Array index for key prop
     * @returns JSX element representing the token row
     */
    const renderTokenItem = (item: TokenAsset, index: number) => (
        <View key={item.symbol} style={styles.tokenItem}>
            <View style={styles.tokenInfoLeft}>
                {/* Token logo with fallback background */}
                {item.logoURI ? (
                    <Image source={{ uri: item.logoURI }} style={styles.tokenIcon} />
                ) : (
                    <View style={[styles.tokenIcon, { backgroundColor: "#ddd" }]} />
                )}
                
                {/* Token name and current price */}
                <View style={styles.tokenNameDetails}>
                    <Text style={styles.tokenName}>{item.name}</Text>
                    <Text style={styles.tokenPrice}>
                        {item.symbol} ${item.price.toFixed(2)}
                    </Text>
                </View>
            </View>
            
            {/* Token amount and total value */}
            <View style={styles.tokenInfoRight}>
                <Text style={styles.tokenAmount}>
                    {isBalanceHidden
                        ? "****"
                        : item.amount >= 1
                        ? item.amount.toFixed(2)
                        : item.amount.toFixed(8).replace(/\.?0+$/, "")}
                </Text>
                <Text style={styles.tokenValue}>
                    {isBalanceHidden ? "****" : `${item.valueUsd.toFixed(2)}`}
                </Text>
            </View>
        </View>
    );
    
    /**
     * Renders skeleton loading state for token items
     * Shows animated placeholder boxes while data loads
     * 
     * @param index - Array index for key prop
     * @returns JSX element representing loading skeleton
     */
    const renderSkeletonItem = (index: number) => (
        <View key={`skeleton-${index}`} style={styles.tokenItem}>
            <View style={styles.tokenInfoLeft}>
                <View style={styles.skeletonTokenIcon} />
                <View style={styles.tokenNameDetails}>
                    <View style={[styles.skeletonTokenName, { height: 16, marginBottom: 6 }]} />
                    <View style={[styles.skeletonTokenPrice, { height: 13 }]} />
                </View>
            </View>
            <View style={styles.tokenInfoRight}>
                <View style={[styles.skeletonTokenAmount, { height: 16, marginBottom: 6 }]} />
                <View style={[styles.skeletonTokenValue, { height: 13 }]} />
            </View>
        </View>
    );
    
    
    /** Creates theme-aware stylesheet */
    const styles = createStyles(isDarkMode);
    
    return (
        <LinearGradient
            colors={
                isDarkMode
                    ? ["#0A0410", "#1a0a2e", "#0A0410"]
                    : ["#FFFFFF", "#dbd4fbff", "#d7cdf2ff"]
            }
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.scrollViewContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={isDarkMode ? "#fff" : "#000"}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Toast notification for coming soon features */}
                <Web3Toast
                    message="In next update..."
                    visible={isToastVisible}
                    onHide={() => setIsToastVisible(false)}
                    isSuccess={false}
                />
                
                <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} />
                
                {/* ========== Testnet Banner ========== */}
                <View style={styles.testnetBanner}>
                    <Ionicons
                        name="flask-outline"
                        size={18}
                        color={isDarkMode ? "#FFA500" : "#D2691E"}
                    />
                    <Text style={styles.testnetBannerText}>Devnet Mode</Text>
                </View>
                
                {/* ========== Top Header ========== */}
                <View style={styles.topHeader}>
                    {/* Back button */}
                    <TouchableOpacity
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        style={[styles.headerIconBackground, { width: 84 }]}
                        onPress={() => router.back()}
                    >
                        <BlurView
                            intensity={isDarkMode ? 40 : 80}
                            tint={isDarkMode ? "dark" : "light"}
                            style={styles.blurViewAbsolute}
                        />
                        <Ionicons
                            name="arrow-back"
                            size={24}
                            color={isDarkMode ? "#A78BFA" : "#5856D6"}
                        />
                    </TouchableOpacity>
                    
                    {/* Right header buttons group */}
                    <View style={styles.rightHeaderGroup}>
                        {/* Balance visibility toggle */}
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={styles.headerIconBackground}
                            onPress={() => setIsBalanceHidden(!isBalanceHidden)}
                        >
                            <BlurView
                                intensity={isDarkMode ? 40 : 80}
                                tint={isDarkMode ? "dark" : "light"}
                                style={styles.blurViewAbsolute}
                            />
                            <Ionicons
                                name={isBalanceHidden ? "eye-off-outline" : "eye-outline"}
                                size={24}
                                color={isDarkMode ? "#A78BFA" : "#5856D6"}
                            />
                        </TouchableOpacity>
                        
                        {/* Transactions button */}
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={[styles.headerIconBackground, { marginLeft: 12 }]}
                            onPress={showComingSoonToast}
                        >
                            <BlurView
                                intensity={isDarkMode ? 40 : 80}
                                tint={isDarkMode ? "dark" : "light"}
                                style={styles.blurViewAbsolute}
                            />
                            <Ionicons
                                name="receipt-outline"
                                size={24}
                                color={isDarkMode ? "#A78BFA" : "#5856D6"}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
                
                {/* ========== Balance Section ========== */}
                <View style={styles.balanceSection}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    {isLoading && !refreshing ? (
                        // Skeleton loader for balance
                        <View style={styles.balanceSkeleton} />
                    ) : (
                        // Total balance display
                        <Text style={styles.totalBalance}>
                            {isBalanceHidden
                                ? "* * * * * "
                                : `${data.totalUsdBalance.toFixed(2)} `}
                            <Text
                                style={{
                                    color: isDarkMode
                                        ? "rgba(255, 255, 255, 0.7)"
                                        : "rgba(0, 0, 0, 0.6)",
                                    fontSize: 32,
                                }}
                            >
                                USD
                            </Text>
                        </Text>
                    )}
                </View>
                
                {/* ========== Quick Action Buttons ========== */}
                <View style={styles.actionButtonsContainer}>
                    {/* Receive button */}
                    <View style={styles.actionButtonWrapper}>
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={styles.actionButton}
                            onPress={showComingSoonToast}
                        >
                            <BlurView
                                intensity={isDarkMode ? 40 : 40}
                                tint={isDarkMode ? "dark" : "light"}
                                style={styles.blurViewAbsolute}
                            />
                            <Ionicons
                                name="arrow-down-outline"
                                size={26}
                                color={isDarkMode ? "#A78BFA" : "#5856D6"}
                            />
                        </TouchableOpacity>
                        <Text style={styles.actionButtonText}>Receive</Text>
                    </View>
                    
                    {/* Send button */}
                    <View style={styles.actionButtonWrapper}>
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={styles.actionButton}
                            onPress={showComingSoonToast}
                        >
                            <BlurView
                                intensity={isDarkMode ? 40 : 40}
                                tint={isDarkMode ? "dark" : "light"}
                                style={styles.blurViewAbsolute}
                            />
                            <Ionicons
                                name="arrow-up-outline"
                                size={26}
                                color={isDarkMode ? "#A78BFA" : "#5856D6"}
                            />
                        </TouchableOpacity>
                        <Text style={styles.actionButtonText}>Send</Text>
                    </View>
                    
                    {/* Swap button */}
                    <View style={styles.actionButtonWrapper}>
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={styles.actionButton}
                            onPress={showComingSoonToast}
                        >
                            <BlurView
                                intensity={isDarkMode ? 40 : 40}
                                tint={isDarkMode ? "dark" : "light"}
                                style={styles.blurViewAbsolute}
                            />
                            <Ionicons
                                name="swap-horizontal-outline"
                                size={26}
                                color={isDarkMode ? "#A78BFA" : "#5856D6"}
                            />
                        </TouchableOpacity>
                        <Text style={styles.actionButtonText}>Swap</Text>
                    </View>
                </View>
                
                {/* ========== Recent Activity Section ========== */}
                <View style={styles.recentActivityContainer}>
                    <View style={styles.recentActivityCard}>
                        <BlurView
                            intensity={isDarkMode ? 30 : 40}
                            tint={isDarkMode ? "dark" : "light"}
                            style={styles.blurViewAbsolute}
                        />
                        <View style={styles.recentActivityInnerContent}>
                            {/* No transactions placeholder */}
                            <View style={styles.recentActivityErrorContainer}>
                                <Ionicons
                                    name="document-text-outline"
                                    size={24}
                                    color={isDarkMode ? "#A09CB8" : "#666"}
                                />
                                <Text
                                    style={[
                                        styles.recentActivityErrorText,
                                        { color: isDarkMode ? "#A09CB8" : "#666" },
                                    ]}
                                >
                                    No recent transactions yet
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
                
                {/* ========== Portfolio Section ========== */}
                <View style={styles.portfolioHeader}>
                    <Text style={styles.portfolioTitle}>Portfolio</Text>
                </View>
                
                {/* Token list or skeleton loaders */}
                {isLoading && !refreshing
                    ? Array(3)
                          .fill(null)
                          .map((_, index) => renderSkeletonItem(index))
                    : data.tokens.map((token, index) => renderTokenItem(token, index))}
                
                {/* Empty state when no tokens */}
                {!isLoading && data.tokens.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Ionicons
                            name="wallet-outline"
                            size={48}
                            color={isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
                        />
                        <Text style={styles.emptyText}>No assets found</Text>
                    </View>
                )}
            </ScrollView>
        </LinearGradient>
    );
}

/**
 * Creates theme-aware stylesheet
 * Returns StyleSheet object with colors adjusted for dark/light mode
 * 
 * @param isDarkMode - Boolean indicating if dark mode is active
 * @returns StyleSheet object with all component styles
 */
const createStyles = (isDarkMode: boolean) =>
    StyleSheet.create({
        // Root container
        container: {
            flex: 1,
        },
        
        // Scroll view content padding
        scrollViewContent: {
            paddingBottom: 30,
        },
        
        // ========== Testnet Banner ==========
        testnetBanner: {
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
        testnetBannerText: {
            color: isDarkMode ? "#FFA500" : "#D2691E",
            fontSize: 14,
            fontWeight: "600",
            marginLeft: 8,
        },
        
        // ========== Top Header ==========
        topHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingTop: 20,
            marginBottom: 30,
        },
        rightHeaderGroup: {
            flexDirection: "row",
            alignItems: "center",
        },
        headerIconBackground: {
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
        blurViewAbsolute: {
            ...StyleSheet.absoluteFillObject,
        },
        
        // ========== Balance Section ==========
        balanceSection: {
            alignItems: "center",
            marginBottom: 16,
        },
        balanceLabel: {
            fontSize: 16,
            fontWeight: "600",
            color: isDarkMode
                ? "rgba(255, 255, 255, 0.7)"
                : "rgba(0, 0, 0, 0.6)",
            marginBottom: 8,
        },
        totalBalance: {
            fontSize: 48,
            fontWeight: "800",
            color: isDarkMode ? "#FFFFFF" : "#000000",
            letterSpacing: -2,
            marginBottom: 4,
        },
        balanceSkeleton: {
            width: 200,
            height: 48,
            borderRadius: 12,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.1)",
        },
        
        // ========== Address Display ==========
        addressContainer: {
            alignItems: "center",
            marginBottom: 30,
        },
        addressPill: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: isDarkMode
                ? "rgba(255, 255, 255, 0.1)"
                : "#F2F2F7",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
        },
        addressText: {
            fontSize: 14,
            color: isDarkMode ? "#A78BFA" : "#666",
            fontFamily: "monospace",
        },
        
        // ========== Action Buttons ==========
        actionButtonsContainer: {
            flexDirection: "row",
            justifyContent: "space-around",
            paddingHorizontal: 10,
            marginBottom: 30,
        },
        actionButtonWrapper: {
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
        actionButtonText: {
            color: isDarkMode ? "#FFFFFF" : "#000000",
            fontSize: 14,
            fontWeight: "600",
        },
        
        // ========== Recent Activity ==========
        recentActivityContainer: {
            paddingHorizontal: 20,
            marginBottom: 30,
        },
        recentActivityCard: {
            borderRadius: 20,
            overflow: "hidden",
            borderWidth: 0.7,
            borderColor: isDarkMode
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(220, 220, 220, 0.5)",
        },
        recentActivityInnerContent: {
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            minHeight: 82,
        },
        recentActivityErrorContainer: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 16,
            paddingHorizontal: 10,
            justifyContent: "center",
            flex: 1,
        },
        recentActivityErrorText: {
            fontSize: 16,
            fontWeight: "600",
            marginLeft: 12,
        },
        
        // ========== Portfolio Section ==========
        portfolioHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            marginBottom: 16,
        },
        portfolioTitle: {
            fontSize: 20,
            fontWeight: "700",
            color: isDarkMode ? "#FFFFFF" : "#000000",
        },
        
        // ========== Token Items ==========
        tokenItem: {
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
        tokenInfoLeft: {
            flexDirection: "row",
            alignItems: "center",
        },
        tokenIcon: {
            width: 40,
            height: 40,
            borderRadius: 20,
            marginRight: 15,
        },
        tokenNameDetails: {
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
        tokenInfoRight: {
            alignItems: "flex-end",
        },
        tokenAmount: {
            fontSize: 16,
            fontWeight: "600",
            color: isDarkMode ? "#FFFFFF" : "#000000",
        },
        tokenValue: {
            fontSize: 13,
            color: isDarkMode
                ? "rgba(255, 255, 255, 0.6)"
                : "rgba(0, 0, 0, 0.5)",
            marginTop: 2,
        },
        
        // ========== Skeleton Loaders ==========
        skeletonTokenIcon: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.1)",
            marginRight: 15,
        },
        skeletonTokenName: {
            width: 80,
            height: 18,
            borderRadius: 4,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.1)",
            marginBottom: 4,
        },
        skeletonTokenPrice: {
            width: 60,
            height: 15,
            borderRadius: 4,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.08)",
        },
        skeletonTokenAmount: {
            width: 70,
            height: 18,
            borderRadius: 4,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.1)",
            marginBottom: 4,
        },
        skeletonTokenValue: {
            width: 90,
            height: 15,
            borderRadius: 4,
            backgroundColor: isDarkMode
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.08)",
        },
        
        // ========== Empty State ==========
        emptyContainer: {
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 40,
        },
        emptyText: {
            textAlign: "center",
            marginTop: 16,
            fontSize: 16,
            color: isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
        },
    });