import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, ScrollView, RefreshControl, StatusBar, Animated, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useColorScheme } from "react-native";

import useWalletAddress from "@/hooks/useWalletAddress";
import usePortfolio from "@/hooks/usePortfolio";
import { useLastTransaction } from "@/hooks/useLastTransaction";

import Header from "./Header";
import BalanceSection from "./BalanceSection";
import QuickActions from "./QuickActions";
import LastTransaction from "./LastTransaction";
import PortfolioList from "./PortfolioList";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";

import { createWalletStyles } from "@/styles/wallet.styles";
import { FadeIn } from "@/components/Shared/motion";
import { MOTION } from "@/constants/motion";

import { DepositBottomSheet, DepositSheetRef } from '@/components/Wallet/NfcDeposit/DepositBottomSheet';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);


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
    const { data, isLoading, isRefreshing, refresh } = usePortfolio();
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

    const transX = useRef(new Animated.Value(0)).current;
    const transY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (Platform.OS === 'ios') {
            const createAnim = (val: Animated.Value, toValue: number, duration: number) => {
                return Animated.sequence([
                    Animated.timing(val, {
                        toValue,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    }),
                    Animated.timing(val, {
                        toValue: 0,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    })
                ]);
            };

            Animated.loop(
                Animated.parallel([
                    createAnim(transX, 15, 12000),
                    createAnim(transY, 10, 15000)
                ])
            ).start();
        }
    }, []);

    /**
     * Handles pull-to-refresh gesture
     * Refreshes both portfolio data and recent activity
     */
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refresh(), refetchActivity()]);
        setRefreshing(false);
    }, [refresh, refetchActivity]);

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

    const styles = useMemo(() => createWalletStyles(isDarkMode), [isDarkMode]);
    const insets = useSafeAreaInsets();
    const showPortfolioSkeleton = isLoading && data.tokens.length === 0;

    return (
        <View style={styles.container}>
            <AnimatedLinearGradient
                colors={
                    isDarkMode
                        ? ["#0A0410", "#1a0a2e", "#0A0410"]
                        : ["#FFFFFF", "#dbd4fbff", "#d7cdf2ff"]
                }
                style={[
                    StyleSheet.absoluteFillObject,
                    Platform.OS === 'ios' ? {
                        transform: [
                            { scale: 1.15 },
                            { translateX: transX },
                            { translateY: transY }
                        ]
                    } : null
                ]}
            />
            <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} />

            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                contentInset={Platform.OS === 'ios' ? { top: insets.top } : undefined}
                contentOffset={Platform.OS === 'ios' ? { x: 0, y: -insets.top } : undefined}
                automaticallyAdjustContentInsets={false}
                contentInsetAdjustmentBehavior="never"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing || isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={isDarkMode ? "#fff" : "#000"}
                        progressViewOffset={Platform.OS === 'android' ? insets.top + 10 : undefined}
                    />
                }
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.dashboardBody}>
                    <View style={styles.dashboardTop}>
                        <Web3Toast
                            message="In next update..."
                            visible={isToastVisible}
                            onHide={() => setIsToastVisible(false)}
                            isSuccess={false}
                        />

                        <FadeIn delay={0}>
                            <Header
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                onToggleBalance={toggleBalanceVisibility}
                                onNavigateBack={() => {
                                    router.push("/profile");
                                }}
                                onNavigateToTransactions={navigateToTransactions}
                            />
                        </FadeIn>

                        <FadeIn delay={MOTION.stagger.step}>
                            <BalanceSection
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                totalBalance={data.tokens.reduce((sum, t) => sum + t.valueUsd, 0)}
                                isLoading={showPortfolioSkeleton}
                            />
                        </FadeIn>

                        <FadeIn delay={MOTION.stagger.step * 2}>
                            <QuickActions
                                isDarkMode={isDarkMode}
                                onReceive={navigateToDeposit}
                                onSend={navigateToSend}
                                onSwap={() => router.push("/swap")}
                                onNfcDeposit={() => depositSheetRef.current?.present()}
                            />
                        </FadeIn>

                        <FadeIn delay={MOTION.stagger.step * 3}>
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
                        </FadeIn>
                    </View>

                    <View style={styles.portfolioBottom}>
                        <FadeIn delay={MOTION.stagger.step * 4} from="bottom" style={{ flex: 1 }}>
                            <PortfolioList
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                tokens={data.tokens}
                                isLoading={showPortfolioSkeleton}
                            />
                        </FadeIn>
                    </View>
                </View>
            </ScrollView>
            <DepositBottomSheet ref={depositSheetRef} />
        </View>
    );
}