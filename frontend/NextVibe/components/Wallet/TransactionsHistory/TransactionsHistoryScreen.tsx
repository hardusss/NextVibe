import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, ActivityIndicator, RefreshControl, StatusBar, useColorScheme, TouchableOpacity } from 'react-native';
import WalletHeader from '@/components/Wallet/Shared/WalletHeader';
import { AlertCircle, History } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';

// Services & API
import SolanaService from '@/src/services/SolanaService';
import getTransactions from '@/src/api/get.transactions';
import loadMoreTransactionsFromBlockchain from '@/src/api/load.more.transactions';
import getTokensPrice from '@/src/api/get.tokens.price';
import { FormattedTransaction } from '@/src/types/solana';
import { parseHeliusTransactions } from '@/src/utils/solana/heliusParser';
import { TOKENS } from '@/constants/Tokens';

// Components
import TransactionItem from './TransactionItem';

// Utils & Styles
import { groupTransactionsByDate } from '@/src/utils/solana/transactionUtils';
import createTransactionsStyles from '@/styles/transactions.styles';
import useWalletAddress from '@/hooks/useWalletAddress';

/**
 * Main Transactions History Screen
 * * Displays a grouped list of wallet transactions with infinite scrolling,
 * pull-to-refresh, and real-time price conversion.
 */
export default function TransactionsHistoryScreen() {
    const isDark = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    // Generate styles based on theme and safe area
    const styles = useMemo(() => createTransactionsStyles(isDark, insets), [isDark, insets]);

    // State
    const [transactions, setTransactions] = useState<FormattedTransaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSignature, setLastSignature] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [isSyncingBlockchain, setIsSyncingBlockchain] = useState<boolean>(false);
    const [prices, setPrices] = useState<
        Record<string, { price: number; change_24h: number; direction: 'up' | 'down' | 'flat' }>
    >({
        solana: { price: 170, change_24h: 0, direction: 'flat' },
        'usd-coin': { price: 1, change_24h: 0, direction: 'flat' },
        seeker: { price: 0, change_24h: 0, direction: 'flat' },
    });

    const { connection, address } = useWalletAddress();
    const walletAddress = address?.toString();

    // --- Data Fetching Logic ---

    const fetchTransactions = async (reset: boolean = false) => {
        try {
            if (reset) {
                setLoading(true);
                setLastSignature(undefined);
                setHasMore(true);
            }
            setError(null);
            if (!connection) {
                throw new Error("Don't have a connection...")
            }
            const rawData = await getTransactions(reset ? undefined : lastSignature);

            if (rawData === null) throw new Error('Failed to fetch transactions');
            
            const data = parseHeliusTransactions(walletAddress as string, rawData);

            if (reset) {
                setTransactions(data);
            } else {
                setTransactions(prev => {
                    const existingSigs = new Set(prev.map(tx => tx.signature));
                    const newTxs = data.filter(tx => !existingSigs.has(tx.signature));
                    return [...prev, ...newTxs];
                });
            }

            if (data.length > 0) {
                setLastSignature(data[data.length - 1].signature);
            }

            if (data.length === 0) setHasMore(false);

        } catch (err) {
            setError('Error loading transactions');
            console.error('Transactions fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPrices = async () => {
        try {
            const priceKeys = Object.values(TOKENS).map(t => t.priceKey).filter(Boolean) as string[];
            const response = await getTokensPrice(priceKeys);
            if (response?.prices) {
                setPrices(prev => ({
                    ...prev,
                    ...response.prices
                }));
            }
        } catch (error) {
            console.error('Price fetch error:', error);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchPrices();
            fetchTransactions(true);
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchTransactions(true);
        setRefreshing(false);
    };

    const loadMore = async () => {
        if (loadingMore || !hasMore || isSyncingBlockchain) return;
        setLoadingMore(true);
        await fetchTransactions(false);
        setLoadingMore(false);
    };

    const handleBlockchainSync = async () => {
        if (isSyncingBlockchain) return;
        setIsSyncingBlockchain(true);
        try {
            await loadMoreTransactionsFromBlockchain(50);
            // Reset and fetch again to display the newly indexed transactions
            await fetchTransactions(true);
        } catch (err) {
            console.error('Failed to sync with blockchain:', err);
            // Optionally, show a toast or error message here
        } finally {
            setIsSyncingBlockchain(false);
        }
    };

    const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

    const renderItem = useCallback(
        ({ item }: { item: FormattedTransaction }) => (
            <TransactionItem item={item} prices={prices} isDark={isDark} styles={styles} />
        ),
        [prices, isDark, styles],
    );

    const renderSectionHeader = useCallback(
        ({ section: { title } }: { section: { title: string } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
        ),
        [styles],
    );

    // --- Render Helpers ---

    const renderFooter = () => {
        if (loadingMore) {
            return (
                <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={isDark ? '#A78BFA' : '#5856D6'} />
                </View>
            );
        }

        if (!hasMore && transactions.length > 0) {
            return (
                <View style={styles.footerLoader}>
                    <TouchableOpacity 
                        onPress={handleBlockchainSync} 
                        disabled={isSyncingBlockchain}
                        style={{
                            paddingVertical: 12,
                            paddingHorizontal: 24,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            borderRadius: 20,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 20,
                        }}
                    >
                        {isSyncingBlockchain ? (
                            <ActivityIndicator size="small" color={isDark ? '#A78BFA' : '#5856D6'} />
                        ) : (
                            <Text style={{
                                color: isDark ? '#A78BFA' : '#5856D6',
                                fontWeight: '600',
                            }}>
                                Load more transactions
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            );
        }

        return null;
    };

    const renderEmptyState = () => (
        <View style={styles.centeredContainer}>
            {loading && !refreshing ? (
               <></>
            ) : error ? (
                <>
                    <AlertCircle size={50} color="#E74C3C" />
                    <Text style={styles.errorText}>{error}</Text>
                </>
            ) : (
                <>
                    <History 
                        size={50} 
                        color={isDark ? '#A09CB8' : '#666'} 
                    />
                    <Text style={styles.statusText}>No transactions found</Text>
                </>
            )}
        </View>
    );

    return (
        <LinearGradient
            colors={isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
            style={{ flex: 1 }}
        >
            <StatusBar
                backgroundColor={isDark ? "#0A0410" : "#fff"}
                barStyle={isDark ? 'light-content' : 'dark-content'}
            />
            <View style={styles.container}>

                <WalletHeader title="Transaction History" isDark={isDark} />
                <SectionList
                    sections={groupedTransactions}
                    keyExtractor={(item) => item.signature}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmptyState}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    removeClippedSubviews
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    initialNumToRender={10}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={isDark ? '#FFFFFF' : '#000'}
                        />
                    }
                    stickySectionHeadersEnabled={false}
                />
            </View>
        </LinearGradient>
    );
}