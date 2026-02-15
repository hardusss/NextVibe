import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, ActivityIndicator, RefreshControl, StatusBar, useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';

// Services & API
import SolanaService from '@/src/services/SolanaService';
import getTokensPrice from '@/src/api/get.tokens.price';
import { FormattedTransaction } from '@/src/types/solana';

// Components
import Header from '@/components/Wallet/Deposit/Header'; 
import TransactionItem from './TransactionItem';

// Utils & Styles
import { groupTransactionsByDate } from '@/src/utils/solana/transactionUtils';
import createTransactionsStyles from '@/styles/transactions.styles';

/**
 * Main Transactions History Screen
 * * Displays a grouped list of wallet transactions with infinite scrolling,
 * pull-to-refresh, and real-time price conversion.
 */
export default function TransactionsHistoryScreen() {
    const isDark = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const router = useRouter();
    
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
    const [prices, setPrices] = useState<{ [key: string]: number }>({ solana: 170, "usd-coin": 1 });

    const { connection, smartWalletPubkey } = useWallet();
    const walletAddress = smartWalletPubkey?.toString();

    // --- Data Fetching Logic ---

    const fetchTransactions = async (reset: boolean = false) => {
        try {
            if (reset) {
                setLoading(true);
                setLastSignature(undefined);
                setHasMore(true);
            }
            setError(null);

            const data = await SolanaService.getTransactionsHistory(
                connection,
                walletAddress as string,
                false,
                reset ? undefined : lastSignature
            );

            if (data === null) throw new Error('Failed to fetch transactions');

            if (reset) {
                setTransactions(data);
            } else {
                setTransactions(prev => [...prev, ...data]);
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
            const response = await getTokensPrice(["solana", "usd-coin"]);
            if (response?.prices) {
                setPrices({
                    solana: response.prices["solana"] ?? prices.solana,
                    "usd-coin": response.prices["usd-coin"] ?? prices["usd-coin"],
                });
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
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchTransactions(false);
        setLoadingMore(false);
    };

    const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

    // --- Render Helpers ---

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={isDark ? '#A78BFA' : '#5856D6'} />
            </View>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.centeredContainer}>
            {loading && !refreshing ? (
               <></>
            ) : error ? (
                <>
                    <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#E74C3C" />
                    <Text style={styles.errorText}>{error}</Text>
                </>
            ) : (
                <>
                    <MaterialCommunityIcons 
                        name="history" 
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

                 {/* Reusable Header Component */}
                <Header
                    title="Transaction History"
                    isDark={isDark}
                    insets={insets}
                    onBack={() => router.back()}
                    animated={true}
                />
                <SectionList
                    sections={groupedTransactions}
                    keyExtractor={(item, index) => item.signature + index}
                    renderItem={({ item }) => (
                        <TransactionItem 
                            item={item} 
                            prices={prices} 
                            isDark={isDark} 
                            styles={styles} 
                        />
                    )}
                    renderSectionHeader={({ section: { title } }) => (
                        <Text style={styles.sectionHeader}>{title}</Text>
                    )}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmptyState}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
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