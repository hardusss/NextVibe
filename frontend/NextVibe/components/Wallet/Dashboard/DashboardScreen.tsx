import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, StatusBar, Animated, Platform, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "react-native";

import useWalletAddress from "@/hooks/useWalletAddress";
import usePortfolio from "@/hooks/usePortfolio";
import { useLastTransaction } from "@/hooks/useLastTransaction";

import Header from "./Header";
import BalanceSection from "./BalanceSection";
import QuickActions from "./QuickActions";
import LastTransaction from "./LastTransaction";
import PortfolioList from "./PortfolioList";
import CollectiblesScreen from "@/components/Wallet/Collectibles/CollectiblesScreen";
import CollectibleDetailSheet from "@/components/Wallet/Collectibles/CollectibleDetailSheet";
import useOwnedAssets, { OwnedAsset } from "@/components/Wallet/Collectibles/useOwnedAssets";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";
import { buildCnftDetailParams } from "@/components/Wallet/Shared/NftTxRow";
import { useCnftDisplayData } from "@/src/utils/solana/cnftMetadata";

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

    // Tokens | Collectibles segmented view + owned NFTs (Helius DAS)
    const params = useLocalSearchParams<{ tab?: string; asset?: string; assetName?: string; assetImage?: string }>();
    const [activeTab, setActiveTab] = useState<"tokens" | "collectibles">(
        params.tab === "collectibles" ? "collectibles" : "tokens"
    );
    const {
        assets: ownedAssets,
        loading: assetsLoading,
        error: assetsError,
        refresh: refreshAssets,
    } = useOwnedAssets(address ? address.toString() : null);
    const [selectedAsset, setSelectedAsset] = useState<OwnedAsset | null>(null);
    const handledAssetParamRef = useRef<string | null>(null);

    // Deep link from transaction history or the collect sheet:
    // /wallet-dash?tab=collectibles&asset=<id>[&assetName=..&assetImage=..]
    useEffect(() => {
        if (params.tab === "collectibles") setActiveTab("collectibles");
    }, [params.tab]);

    useEffect(() => {
        const assetId = typeof params.asset === "string" ? params.asset : null;
        if (!assetId || handledAssetParamRef.current === assetId) return;

        const openAsset = (asset: OwnedAsset) => {
            handledAssetParamRef.current = assetId;
            setSelectedAsset(asset);
            scrollRef.current?.scrollToEnd({ animated: true });
        };

        const match = ownedAssets.find(a => a.id === assetId);
        if (match) {
            openAsset(match);
        } else if (typeof params.assetName === "string" && params.assetName) {
            // Just-minted asset not indexed by DAS yet — open with the data
            // the collect flow passed along instead of waiting.
            openAsset({
                id: assetId,
                name: params.assetName,
                image: typeof params.assetImage === "string" && params.assetImage ? params.assetImage : null,
                jsonUri: null,
                compressed: true,
                collection: null,
                collectionName: null,
                isNextVibe: true,
                pill: "Post",
            });
        }
    }, [params.asset, params.assetName, params.assetImage, ownedAssets]);

    // Bottom Sheet Ref
    const depositSheetRef = useRef<DepositSheetRef>(null);
    const scrollRef = useRef<ScrollView>(null);

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
        await Promise.all([refresh(), refetchActivity(), refreshAssets()]);
        setRefreshing(false);
    }, [refresh, refetchActivity, refreshAssets]);

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

    // cNFT last-transaction card opens the same detail screen as history,
    // so resolve its display name/image (memory-cached, shared with rows).
    const isCnftLastTx = lastTransaction?.token === "cNFT" && !!lastTransaction.nft;
    const lastTxCnftDisplay = useCnftDisplayData(
        isCnftLastTx ? lastTransaction!.nft!.assetId : null,
        isCnftLastTx ? lastTransaction!.nft!.uri : null,
    );

    /**
     * Handles a tap on the Last Transaction card — cNFT items open the
     * transaction detail screen with the same params as a history row,
     * everything else goes to the history list.
     */
    const handleLastTransactionPress = () => {
        if (activityError) {
            handleRefresh();
        } else if (lastTransaction && isCnftLastTx) {
            router.push(buildCnftDetailParams(
                lastTransaction,
                lastTransaction.nft!.name ?? lastTxCnftDisplay.name,
                lastTxCnftDisplay.image,
            ));
        } else if (lastTransaction) {
            navigateToTransactions();
        }
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

            <View
                style={[
                    styles.container,
                    { paddingTop: insets.top }
                ]}
            >
                <ScrollView
                    ref={scrollRef}
                    style={styles.container}
                    contentContainerStyle={{ flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing || isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={isDarkMode ? "#fff" : "#000"}
                        />
                    }
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
                                    onPress={handleLastTransactionPress}
                                />
                            </FadeIn>
                        </View>

                        <View style={styles.portfolioBottom}>
                            <FadeIn delay={MOTION.stagger.step * 4} from="bottom" style={{ flex: 1 }}>
                                {/* Tokens | Collectibles segmented header */}
                                <View style={segmentedStyles.container}>
                                    {(["tokens", "collectibles"] as const).map(tab => {
                                        const isActive = activeTab === tab;
                                        return (
                                            <TouchableOpacity
                                                key={tab}
                                                style={[
                                                    segmentedStyles.segment,
                                                    isActive && {
                                                        backgroundColor: isDarkMode
                                                            ? "rgba(139,92,246,0.25)"
                                                            : "rgba(124,58,237,0.12)",
                                                    },
                                                ]}
                                                activeOpacity={0.8}
                                                onPress={() => setActiveTab(tab)}
                                            >
                                                <Text
                                                    style={[
                                                        segmentedStyles.segmentText,
                                                        {
                                                            color: isActive
                                                                ? (isDarkMode ? "#d8b4fe" : "#7c3aed")
                                                                : (isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"),
                                                        },
                                                    ]}
                                                >
                                                    {tab === "tokens" ? "Tokens" : "Collectibles"}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {activeTab === "tokens" ? (
                                    <PortfolioList
                                        isDarkMode={isDarkMode}
                                        isBalanceHidden={isBalanceHidden}
                                        tokens={data.tokens}
                                        isLoading={showPortfolioSkeleton}
                                    />
                                ) : (
                                    <CollectiblesScreen
                                        isDarkMode={isDarkMode}
                                        assets={ownedAssets}
                                        loading={assetsLoading}
                                        error={assetsError}
                                        onSelect={setSelectedAsset}
                                    />
                                )}
                            </FadeIn>
                        </View>
                    </View>
                </ScrollView>
            </View>
            <DepositBottomSheet ref={depositSheetRef} />
            <CollectibleDetailSheet
                visible={selectedAsset !== null}
                asset={selectedAsset}
                onClose={() => setSelectedAsset(null)}
            />
        </View>
    );
}

// ─── Segmented control styles ────────────────────────────────────────────────

const segmentedStyles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignSelf: "center",
        gap: 6,
        marginBottom: 10,
        padding: 3,
        borderRadius: 16,
    },
    segment: {
        paddingHorizontal: 18,
        paddingVertical: 7,
        borderRadius: 13,
    },
    segmentText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        letterSpacing: 0.3,
        includeFontPadding: false,
    },
});