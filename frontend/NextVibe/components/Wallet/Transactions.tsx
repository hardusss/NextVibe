import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, useColorScheme } from 'react-native';
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

export default function TransactionsScreen() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
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

  const formatDate = (timestamp: number) => {
    const timestampMs = timestamp > 10000000000 ? timestamp : timestamp * 1000;
    const date = new Date(timestampMs);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTransactionItem = ({ item }: { item: Transaction }) => {
    const isIncoming = item.direction === 'incoming';
    
    return (
      <TouchableOpacity 
        style={[styles.transactionItem, { backgroundColor: isDarkMode ? '#121212' : '#fff' }]}
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
              from_address: item.direction === 'incoming' ? item.to_address : '',
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
            backgroundColor: isIncoming ? '#4CAF50' : '#F44336' 
          }]}>
            <MaterialCommunityIcons 
              name={isIncoming ? 'arrow-down' : 'arrow-up'} 
              size={12} 
              color="#fff" 
            />
          </View>
        </View>
        
        <View style={styles.transactionInfo}>
          <Text style={[styles.transactionType, { color: isDarkMode ? '#fff' : '#000' }]}>
            {isIncoming ? 'Received' : 'Sent'}
          </Text>
          <Text style={[styles.transactionAddress, { color: isDarkMode ? '#aaa' : '#666' }]} numberOfLines={1}>
            {item.to_address}
          </Text>
        </View>
        
        <View style={styles.transactionDetails}>
          <Text style={[styles.transactionAmount, { 
            color: isIncoming ? '#4CAF50' : '#F44336' 
          }]}>
            {isIncoming ? '+' : '-'}{item.amount}
          </Text>
          <Text style={[styles.transactionDate, { color: isDarkMode ? '#aaa' : '#666' }]}>
            {formatDate(item.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkMode ? '#000' : '#f5f5f5',
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      paddingTop: 10,
    },
    backButton: {
      marginRight: 15,
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: isDarkMode ? '#fff' : '#000',
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDarkMode ? '#333' : '#eee',
    },
    transactionIconContainer: {
      position: 'relative',
      marginRight: 16,
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    directionIndicator: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: isDarkMode ? '#000' : '#fff',
    },
    transactionInfo: {
      flex: 1,
    },
    transactionType: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    transactionAddress: {
      fontSize: 13,
      width: '80%',
    },
    transactionDetails: {
      alignItems: 'flex-end',
    },
    transactionAmount: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    transactionDate: {
      fontSize: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 50,
    },
    emptyText: {
      fontSize: 16,
      color: isDarkMode ? '#aaa' : '#666',
      textAlign: 'center',
      marginTop: 20,
    },
    errorText: {
      fontSize: 16,
      color: '#F44336',
      textAlign: 'center',
      marginTop: 20,
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar 
        backgroundColor={isDarkMode ? "#000" : "#fff"}
        barStyle={isDarkMode ? "light-content" : "dark-content"}
      />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/wallet")}>
          <MaterialCommunityIcons 
            name="arrow-left" 
            size={24} 
            color={isDarkMode ? '#fff' : '#000'} 
          />
        </TouchableOpacity>
        <Text style={styles.title}>Transaction History</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#00CED1" />
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#F44336" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="history" size={50} color={isDarkMode ? '#aaa' : '#666'} />
          <Text style={styles.emptyText}>You don't have any transactions yet</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransactionItem}
          keyExtractor={(item) => item.tx_id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
                colors={['#00CED1']} 
                tintColor={isDarkMode ? '#fff' : '#000'}
            />
          }
        />
      )}
    </View>
  );
}