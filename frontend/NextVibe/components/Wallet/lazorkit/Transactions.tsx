import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import SolanaService, { FormattedTransaction } from '@/src/services/SolanaService';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import getTokensPrice from '@/src/api/get.tokens.price';
import { TOKENS } from '@/constants/Tokens';
/**
 * Price data structure from CoinGecko API
 * Keys must match CoinGecko token identifiers
 */
interface Prices {
    solana: number;
    "usd-coin": number;
}

/**
 * Groups transactions by date with smart labeling
 * Today/Yesterday get special labels, older dates show full date
 * 
 * @param transactions - Array of formatted Solana transactions
 * @returns Sections array for SectionList component
 */
const groupTransactionsByDate = (transactions: FormattedTransaction[]) => {
    if (!transactions || transactions.length === 0) {
        return [];
    }

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const grouped = transactions.reduce((acc, transaction) => {
        const date = transaction.time || new Date();
        
        let sectionTitle: string;
        if (isSameDay(date, today)) {
            sectionTitle = 'Today';
        } else if (isSameDay(date, yesterday)) {
            sectionTitle = 'Yesterday';
        } else {
            sectionTitle = date.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }

        if (!acc[sectionTitle]) {
            acc[sectionTitle] = [];
        }
        acc[sectionTitle].push(transaction);
        return acc;
    }, {} as { [key: string]: FormattedTransaction[] });

    return Object.keys(grouped).map(title => ({
        title,
        data: grouped[title]
    }));
};

export default function TransactionsScreen() {
    const isDarkMode = useColorScheme() === 'dark';
    const router = useRouter();
    
    // Transaction state management
    const [transactions, setTransactions] = useState<FormattedTransaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    
    // Pagination state - tracks last fetched signature for cursor-based loading
    const [lastSignature, setLastSignature] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState<boolean>(true);
    
    // Market prices for USD conversion
    const [prices, setPrices] = useState<Prices>({
        solana: 170,
        "usd-coin": 1
    });

    const { connection, smartWalletPubkey } = useWallet();
    const walletAddress = smartWalletPubkey?.toString();

    /**
     * Fetches transaction history with pagination support
     * Uses cursor-based pagination via lastSignature for efficient loading
     * 
     * @param reset - If true, clears existing data and starts from beginning
     */
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

            if (data === null) {
                throw new Error('Failed to fetch transactions');
            }

            // Append new transactions or replace all if reset
            if (reset) {
                setTransactions(data);
            } else {
                setTransactions(prev => [...prev, ...data]);
            }

            // Update pagination cursor for next batch
            if (data.length > 0) {
                setLastSignature(data[data.length - 1].signature);
            }

            // Detect end of transaction history (received less than requested)
            if (data.length < 5) {
                setHasMore(false);
            }
        } catch (err) {
            setError('Error loading transactions');
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Fetches current market prices from CoinGecko API
     * Handles undefined response gracefully with type-safe checking
     */
    const fetchPrices = async () => {
        try {
            const response = await getTokensPrice(["solana", "usd-coin"]);
            
            // Type-safe price update - only set if response exists and has prices
            if (response?.prices) {
            setPrices({
                solana: response.prices["solana"] ?? prices.solana,
                "usd-coin": response.prices["usd-coin"] ?? prices["usd-coin"],
            });
        }
        } catch (error) {
            console.error('Failed to fetch token prices:', error);
            // Silently fail - default prices already set in state
        }
    };

    /**
     * Initialize data on screen focus
     * Refetches prices and transactions each time user navigates to screen
     */
    useFocusEffect(
        useCallback(() => {
            fetchPrices();
            fetchTransactions(true);
        }, [])
    );

    /**
     * Pull-to-refresh handler
     * Resets pagination and fetches fresh data
     */
    const onRefresh = async () => {
        setRefreshing(true);
        await fetchTransactions(true);
        setRefreshing(false);
    };

    /**
     * Infinite scroll handler
     * Loads next batch of transactions when user scrolls near bottom
     */
    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        
        setLoadingMore(true);
        await fetchTransactions(false);
        setLoadingMore(false);
    };

    // Memoized grouped transactions to prevent unnecessary recalculations
    const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

    /**
     * Retrieves token metadata by token identifier
     * Provides fallback for unknown tokens with truncated address
     * 
     * @param token - Token identifier (SOL, USDC, or mint address)
     */
    const getTokenInfo = (token: string) => {
        if (token === 'SOL') return TOKENS.SOL;
        if (token === 'USDC') return TOKENS.USDC;
        
        // Fallback for unrecognized tokens - display truncated mint address
        return {
            symbol: token.substring(0, 4) + '...',
            name: 'Unknown Token',
            priceKey: 'solana' as const, // Default to SOL price as fallback
            logoURL: 'https://via.placeholder.com/44'
        };
    };

    /**
     * Renders individual transaction item with glassmorphism effect
     * Displays amount, direction indicator, and USD value conversion
     */
    const renderTransactionItem = ({ item }: { item: FormattedTransaction }) => {
        const isIncoming = item.type === 'received';
        const tokenInfo = getTokenInfo(item.token);
        
        // Map token to corresponding price key for accurate USD conversion
        const price = prices[tokenInfo.priceKey] || 0;
        
        return (
            <TouchableOpacity 
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                style={styles.transactionItem}
                onPress={() => {
                    router.push({
                        pathname: "/transaction-detail",
                        params: {
                            tx_id: item.signature,
                            amount: item.amount,
                            direction: item.type,
                            icon: tokenInfo.logoURL,
                            timestamp: item.time?.getTime() || Date.now(),
                            to_address: item.to,
                            from_address: item.from,
                            blockchain: item.token,
                            usdValue: (item.amount * price).toFixed(2),
                            tx_url: `https://solscan.io/tx/${item.signature}?cluster=devnet`
                        }
                    });
                }}
            >
                {/* Glassmorphism blur effect */}
                <BlurView
                    intensity={isDarkMode ? 30 : 90}
                    tint={isDarkMode ? 'dark' : 'light'}
                    style={styles.blurViewAbsolute}
                />
                <View style={styles.transactionItemContent}>
                    {/* Token icon with directional indicator overlay */}
                    <View style={styles.transactionIconContainer}>
                        <FastImage source={{ uri: tokenInfo.logoURL }} style={styles.tokenIcon} />
                        <View style={[styles.directionIndicator, { 
                            backgroundColor: isIncoming ? '#2ECC71' : '#E74C3C',
                            borderColor: isDarkMode ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                        }]}>
                            <MaterialCommunityIcons 
                                name={isIncoming ? 'arrow-bottom-left' : 'arrow-top-right'} 
                                size={14} 
                                color="#fff" 
                            />
                        </View>
                    </View>
                    
                    {/* Transaction metadata */}
                    <View style={styles.transactionInfo}>
                        <Text style={styles.transactionType}>
                            {isIncoming ? 'Received' : 'Sent'}
                        </Text>
                        <Text style={styles.transactionAddress} numberOfLines={1} ellipsizeMode="middle">
                            {isIncoming ? `From: ${item.from}` : `To: ${item.to}`}
                        </Text>
                    </View>
                    
                    {/* Amount display with dynamic precision and USD value */}
                    <View style={styles.transactionDetails}>
                        <Text style={[styles.transactionAmount, { 
                            color: isIncoming ? '#2ECC71' : isDarkMode ? '#FF6B6B' : '#E74C3C'
                        }]}>
                            {isIncoming ? '+' : '-'}
                            {item.amount.toFixed(item.token === 'SOL' ? 4 : 2)} {tokenInfo.symbol}
                        </Text>
                        <Text style={styles.transactionUsdAmount}>
                            $ {(item.amount * price).toFixed(2)}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    /**
     * Loading indicator shown during pagination
     * Only visible when fetching additional transactions
     */
    const renderFooter = () => {
        if (!loadingMore) return null;
        
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={isDarkMode ? '#A78BFA' : '#5856D6'} />
            </View>
        );
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: 'transparent',
            paddingHorizontal: 16,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 20,
            paddingBottom: 10,
        },
        backButton: {
            marginRight: 15,
        },
        title: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDarkMode ? '#FFFFFF' : '#000',
        },
        sectionHeader: {
            fontSize: 14,
            fontWeight: '600',
            color: isDarkMode ? '#A09CB8' : '#666',
            paddingVertical: 12,
            paddingHorizontal: 4,
            backgroundColor: 'transparent',
        },
        transactionItem: {
            borderRadius: 16,
            marginBottom: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
        },
        transactionItemContent: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
        },
        blurViewAbsolute: {
            ...StyleSheet.absoluteFillObject,
        },
        transactionIconContainer: {
            position: 'relative',
            marginRight: 16,
        },
        tokenIcon: {
            width: 44,
            height: 44,
            borderRadius: 22,
        },
        directionIndicator: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
        },
        transactionInfo: {
            flex: 1,
        },
        transactionType: {
            fontSize: 16,
            fontWeight: '600',
            color: isDarkMode ? '#FFFFFF' : '#000',
            marginBottom: 4,
        },
        transactionAddress: {
            fontSize: 13,
            color: isDarkMode ? '#A09CB8' : '#666',
        },
        transactionDetails: {
            alignItems: 'flex-end',
        },
        transactionAmount: {
            fontSize: 16,
            fontWeight: 'bold',
            marginBottom: 4,
        },
        transactionUsdAmount: {
            fontSize: 12,
            color: isDarkMode ? '#A09CB8' : '#666',
        },
        centeredContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
        },
        statusText: {
            fontSize: 16,
            color: isDarkMode ? '#A09CB8' : '#666',
            textAlign: 'center',
            marginTop: 20,
        },
        errorText: {
            fontSize: 16,
            color: '#E74C3C',
            textAlign: 'center',
            marginTop: 20,
        },
        footerLoader: {
            paddingVertical: 20,
            alignItems: 'center',
        },
    });

    return (
        <LinearGradient
            colors={
                isDarkMode
                ? ['#0A0410', '#1a0a2e', '#0A0410']
                : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
            }
            style={{flex: 1}}
        >
            <View style={styles.container}>
                <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"}/>  
                
                {/* Header with back navigation */}
                <View style={styles.header}>
                    <TouchableOpacity 
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                        style={styles.backButton} 
                        onPress={() => router.back()}
                    >
                        <MaterialCommunityIcons 
                            name="arrow-left" 
                            size={28} 
                            color={isDarkMode ? '#FFFFFF' : '#000'} 
                        />
                    </TouchableOpacity>
                    <Text style={styles.title}>Transaction History</Text>
                </View>

                {/* Loading states and transaction list */}
                {loading && !refreshing ? (
                    <View style={styles.centeredContainer}>
                        <ActivityIndicator size="large" color={isDarkMode ? '#A78BFA' : '#5856D6'} />
                    </View>
                ) : error ? (
                    <View style={styles.centeredContainer}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#E74C3C" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : (
                    <SectionList
                        sections={groupedTransactions}
                        renderItem={renderTransactionItem}
                        renderSectionHeader={({ section: { title } }) => (
                            <Text style={styles.sectionHeader}>{title}</Text>
                        )}
                        keyExtractor={(item, index) => item.signature + index}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.centeredContainer}>
                                <MaterialCommunityIcons 
                                    name="history" 
                                    size={50} 
                                    color={isDarkMode ? '#A09CB8' : '#666'} 
                                />
                                <Text style={styles.statusText}>You don't have any transactions yet</Text>
                            </View>
                        }
                        ListFooterComponent={renderFooter}
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.5}
                        refreshControl={
                            <RefreshControl 
                                refreshing={refreshing} 
                                onRefresh={onRefresh} 
                                tintColor={isDarkMode ? '#FFFFFF' : '#000'}
                            />
                        }
                        stickySectionHeadersEnabled={false}
                    />
                )}
            </View>
        </LinearGradient>
    );
}