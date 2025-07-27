import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import getTransactions from '@/src/api/get.transactions';
import FastImage from 'react-native-fast-image';

interface Transaction {
    amount: number;
    direction: string;
    icon: string;
    timestamp: number;
    to_address: string;
    tx_id: string;
    blockchain: string;
    usdValue: string;
    tx_url: string;
}

const groupTransactionsByDate = (transactions: Transaction[]) => {
    if (!transactions || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort((a, b) => {
        const timestampA = a.timestamp > 10000000000 ? a.timestamp : a.timestamp * 1000;
        const timestampB = b.timestamp > 10000000000 ? b.timestamp : b.timestamp * 1000;
        return timestampB - timestampA;
    });

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const grouped = sortedTransactions.reduce((acc, transaction) => {
        const timestampMs = transaction.timestamp > 10000000000 ? transaction.timestamp : transaction.timestamp * 1000;
        const date = new Date(timestampMs);
        
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
    }, {} as { [key: string]: Transaction[] });

    return Object.keys(grouped).map(title => ({
        title,
        data: grouped[title]
    }));
};


export default function TransactionsScreen() {
    const isDarkMode = useColorScheme() === 'dark';
    const router = useRouter();
    
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getTransactions();
            setTransactions(data);
        } catch (err) {
            setError('Error loading transactions');
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchTransactions();
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchTransactions();
        setRefreshing(false);
    };

    const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

    const renderTransactionItem = ({ item }: { item: Transaction }) => {
        const isIncoming = item.direction === 'incoming';
        
        return (
            <TouchableOpacity 
                style={styles.transactionItem}
                onPress={() => {
                    router.push({
                        pathname: "/transaction-detail",
                        params: {
                            tx_id: item.tx_id,
                            amount: item.amount,
                            direction: item.direction,
                            icon: item.icon,
                            timestamp: item.timestamp,
                            to_address: item.to_address,
                            from_address: '', // This should be passed from API if available
                            blockchain: item.blockchain || 'CRYPTO',
                            usdValue: item.usdValue || '',
                            tx_url: item.tx_url || ''
                        }
                    });
                }}
            >
                <View style={styles.transactionIconContainer}>
                    <FastImage source={{ uri: item.icon }} style={styles.tokenIcon} />
                    <View style={[styles.directionIndicator, { 
                        backgroundColor: isIncoming ? '#2ECC71' : '#E74C3C' 
                    }]}>
                        <MaterialCommunityIcons 
                            name={isIncoming ? 'arrow-bottom-left' : 'arrow-top-right'} 
                            size={14} 
                            color="#fff" 
                        />
                    </View>
                </View>
                
                <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                        {isIncoming ? 'Received' : 'Sent'}
                    </Text>
                    <Text style={styles.transactionAddress} numberOfLines={1} ellipsizeMode="middle">
                        {isIncoming ? `From: ${item.to_address}` : `To: ${item.to_address}`}
                    </Text>
                </View>
                
                <View style={styles.transactionDetails}>
                    <Text style={[styles.transactionAmount, { 
                        color: isIncoming ? '#2ECC71' : isDarkMode ? '#FF6B6B' : '#E74C3C'
                    }]}>
                        {isIncoming ? '+' : '-'}{item.amount}
                    </Text>
                    <Text style={styles.transactionUsdAmount}>
                        ${item.usdValue}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDarkMode ? '#0A0410' : '#F5F5F7',
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
            backgroundColor: isDarkMode ? '#0A0410' : '#F5F5F7',
        },
        transactionItem: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDarkMode ? '#180F2E' : '#FFFFFF',
            padding: 16,
            borderRadius: 16,
            marginBottom: 12,
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
            borderColor: isDarkMode ? '#180F2E' : '#FFFFFF',
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
    });

    return (
        <View style={styles.container}>
            <StatusBar 
                backgroundColor={isDarkMode ? "#0A0410" : "#F5F5F7"}
                barStyle={isDarkMode ? "light-content" : "dark-content"}
            />
            
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.push("/wallet")}>
                    <MaterialCommunityIcons 
                        name="arrow-left" 
                        size={28} 
                        color={isDarkMode ? '#FFFFFF' : '#000'} 
                    />
                </TouchableOpacity>
                <Text style={styles.title}>Transaction History</Text>
            </View>

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
                    keyExtractor={(item, index) => item.tx_id + index}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.centeredContainer}>
                            <MaterialCommunityIcons name="history" size={50} color={isDarkMode ? '#A09CB8' : '#666'} />
                            <Text style={styles.statusText}>You don't have any transactions yet</Text>
                        </View>
                    }
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
    );
}
