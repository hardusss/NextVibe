import React, { useState } from "react";
import { ScrollView, RefreshControl, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useColorScheme } from "react-native";

import useWalletAddress from "@/hooks/useWalletAddress";
import usePortfolio from "@/hooks/usePortfolio";
import { useLastTransaction } from "@/hooks/useLastTransaction";

import Header from "./Header";
import DevnetBanner from "./DevnetBanner";
import BalanceSection from "./BalanceSection";
import QuickActions from "./QuickActions";
import LastTransaction from "./LastTransaction";
import PortfolioList from "./PortfolioList";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";

import { createWalletStyles } from "@/styles/wallet.styles";

import { useRef } from 'react';
import { DepositBottomSheet, DepositSheetRef } from '@/components/Wallet/NfcDeposit/DepositBottomSheet';


/**
 * WalletDashboard Component
 * 
 * Main wallet interface providing comprehensive portfolio management.
 * Implements glassmorphic UI with pull-to-refresh and theme support.
 * 
 * Architecture:
 * - Smart component handling state and business logic
 * - Presentational child components for UI rendering
 * - Custom hooks for data fetching and management
 * - Theme-aware styling system
 * 
 * Features:
 * - Real-time portfolio balance tracking
 * - Token list with live prices
 * - Recent transaction display
 * - Quick action buttons (Send, Receive, Swap)
 * - Pull-to-refresh for manual updates
 * - Balance visibility toggle
 * - Responsive dark/light theme
 * 
 * @component
 */
export default function WalletDashboardScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === "dark";

    const { connection, address, disconnect } = useWalletAddress();
    const { data, isLoading, refresh } = usePortfolio();
    const {
        lastTransaction,
        lastTransactionTokenPrice,
        isLoadTransaction,
        error: activityError,
        refetch: refetchActivity
    } = useLastTransaction(connection, address);

    // UI state management
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isToastVisible, setIsToastVisible] = useState(false);

    // Bottom Sheet Ref
    const depositSheetRef = useRef<DepositSheetRef>(null);

    /**
     * Handles pull-to-refresh gesture
     * Refreshes both portfolio data and recent activity
     */
    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([refresh(), refetchActivity()]);
        setRefreshing(false);
    };

    /**
     * Toggles balance visibility across all components
     */
    const toggleBalanceVisibility = () => {
        setIsBalanceHidden(prev => !prev);
    };

    /**
     * Shows coming soon notification for unavailable features
     */
    const showComingSoonToast = () => {
        setIsToastVisible(true);
    };

    /**
     * Navigates to transactions history screen
     */
    const navigateToTransactions = () => {
        router.push("/transactions");
    };

    /**
     * Navigates to deposit screen
     */
    const navigateToDeposit = () => {
        router.push("/deposit");
    };

    /**
     * Navigates to send token screen
     */
    const navigateToSend = () => {
        router.push("/select-token");
    };

    const styles = createWalletStyles(isDarkMode);

    return (
        <LinearGradient
            colors={
                isDarkMode
                    ? ["#0A0410", "#1a0a2e", "#0A0410"]
                    : ["#FFFFFF", "#dbd4fbff", "#d7cdf2ff"]
            }
            style={styles.container}
        >
            <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} />

            <ScrollView
                scrollEnabled={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={isDarkMode ? "#fff" : "#000"}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                <Web3Toast
                    message="In next update..."
                    visible={isToastVisible}
                    onHide={() => setIsToastVisible(false)}
                    isSuccess={false}
                />

                <DevnetBanner isDarkMode={isDarkMode} />

                <Header
                    isDarkMode={isDarkMode}
                    isBalanceHidden={isBalanceHidden}
                    onToggleBalance={toggleBalanceVisibility}
                    onNavigateBack={() => { 
                        router.push("/profile")
                        if (address) {disconnect();} }}
                    onNavigateToTransactions={navigateToTransactions}
                />

                <BalanceSection
                    isDarkMode={isDarkMode}
                    isBalanceHidden={isBalanceHidden}
                    totalBalance={data.totalUsdBalance}
                    isLoading={isLoading && !refreshing}
                />

                <QuickActions
                    isDarkMode={isDarkMode}
                    onReceive={navigateToDeposit}
                    onSend={navigateToSend}
                    onSwap={showComingSoonToast}
                    onNfcDeposit={() => depositSheetRef.current?.present()}
                />

                <LastTransaction
                    isDarkMode={isDarkMode}
                    isBalanceHidden={isBalanceHidden}
                    transaction={lastTransaction}
                    tokenPrice={lastTransactionTokenPrice}
                    isLoading={isLoadTransaction}
                    error={activityError}
                    onPress={() => {
                        if (activityError) {
                            handleRefresh();
                        } else if (lastTransaction) {
                            navigateToTransactions();
                        }
                    }}
                />

                <PortfolioList
                    isDarkMode={isDarkMode}
                    isBalanceHidden={isBalanceHidden}
                    tokens={data.tokens}
                    isLoading={isLoading && !refreshing}
                />
                <DepositBottomSheet ref={depositSheetRef} />
            </ScrollView>
        </LinearGradient>
    );
}