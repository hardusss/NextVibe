import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme, RefreshControl, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import getBalanceWallet from '@/src/api/wallet.balance';
import formatNumberWithCommas from '@/src/utils/formatedNumberUs';
import { useRouter, useFocusEffect } from 'expo-router';
import FastImage from 'react-native-fast-image';
import Web3Toast from '../Shared/Toasts/Web3Toast';

type Token = {
  name: string;
  symbol: string;
  icon: string;
  price: number;
  amount: number;
};

export default function WalletScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const response = await getBalanceWallet();

      if (response.length > 1) {
        const tokensArray: Token[] = Object.values(response[1]).map((value: any) => ({
          name: value.name,
          symbol: value.symbol,
          icon: value.icon,
          price: value.price,
          amount: value.amount,
        }));
        setTokens(tokensArray);
      }

      setTotalBalance(`${formatNumberWithCommas(response[0])} $`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBalance();
  };

  const styles = StyleSheet.create({
    container: { backgroundColor: isDarkMode ? '#0A0410' : '#f2f2f2', flex: 1, padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerButton: { padding: 8 },
    balanceCardWrapper: { marginBottom: 24, position: "relative" },
    balanceCard: {
      backgroundColor: isDarkMode ? '#180F2E' : '#FFFFFF',
      borderRadius: 20,
      padding: 24,
      shadowColor: isDarkMode ? '#A78BFA' : '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDarkMode ? 0.15 : 0.1,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.12)' : 'rgba(0, 0, 0, 0.06)',
      position: "relative"
    },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,position: "relative" },
    balanceLabel: { color: isDarkMode ? '#A09CB8' : '#666', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
    eyeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.1)' : 'rgba(88, 86, 214, 0.1)', justifyContent: 'center', alignItems: 'center' },
    totalBalance: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 40, fontWeight: '700', marginBottom: 4, letterSpacing: -1 },
    balanceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: isDarkMode ? 'rgba(167, 139, 250, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
    portfolioLabel: { color: isDarkMode ? '#A09CB8' : '#666', fontSize: 12, fontWeight: '500' },
    tokensCount: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 13, fontWeight: '700', marginLeft: 4 },
    skeletonBalance: { width: '70%', height: 40, backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.1)' : '#E0E0E0', borderRadius: 12 },
    buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, gap: 8 },
    actionButton: {
      flex: 1,
      backgroundColor: isDarkMode ? '#180F2E' : '#FFFFFF',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 3,
      borderWidth: 1,
      borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.08)' : 'rgba(0, 0, 0, 0.04)',
    },
    actionIconWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(88, 86, 214, 0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    actionText: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 11, fontWeight: '600' },
    tokenItem: { backgroundColor: isDarkMode ? '#180F2E' : '#fff', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    tokenIcon: { width: 40, height: 40, marginRight: 15 },
    tokenInfo: { flex: 1 },
    tokenName: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 16, fontWeight: 'bold' },
    tokenPrice: { color: isDarkMode ? '#A09CB8' : '#555', fontSize: 12 },
    tokenAmount: { alignItems: 'flex-end' },
    tokenValue: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 16, fontWeight: 'bold' },
    tokenQty: { color: isDarkMode ? '#A09CB8' : '#555', fontSize: 12 },
    skeletonCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDarkMode ? '#1C112E' : '#ddd', marginRight: 15 },
    skeletonSmall: { width: 80, height: 15, backgroundColor: isDarkMode ? '#1C112E' : '#ddd', borderRadius: 6, marginVertical: 3 },
    shimmer: { width: '40%', height: 15, backgroundColor: isDarkMode ? '#1C112E' : '#ddd', borderRadius: 6, marginVertical: 3 },
    historyButton: { backgroundColor: isDarkMode ? '#180F2E' : '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    historyText: { color: isDarkMode ? '#FFFFFF' : '#000', fontSize: 16, fontWeight: '500' },

  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDarkMode ? '#fff' : '#000'} />}
    >
      <Web3Toast message="Coming Soon..." visible={isToastVisible} onHide={() => setIsToastVisible(false)} isSuccess={false} />
      <StatusBar backgroundColor={isDarkMode ? '#0A0410' : '#fff'} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={isDarkMode ? '#fafafa' : '#000'} />
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCardWrapper}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <TouchableOpacity style={styles.eyeButton} onPress={() => setIsBalanceHidden(!isBalanceHidden)}>
              <Ionicons name={isBalanceHidden ? 'eye-off-outline' : 'eye-outline'} size={16} color={isDarkMode ? '#A78BFA' : '#5856D6'} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.skeletonBalance} />
          ) : (
            <Text style={styles.totalBalance}>{isBalanceHidden ? '*****' : totalBalance}</Text>
          )}

          <View style={styles.balanceFooter}>
            <Text style={styles.portfolioLabel}>Assets:</Text>
            <Text style={styles.tokensCount}>{tokens.length} tokens</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/select-token', params: { from_page: 'send' } })}>
          <View style={styles.actionIconWrapper}>
            <Ionicons name="paper-plane-outline" size={20} color={isDarkMode ? '#A78BFA' : '#5856D6'} />
          </View>
          <Text style={styles.actionText}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/select-token', params: { from_page: 'deposit' } })}>
          <View style={styles.actionIconWrapper}>
            <Ionicons name="download-outline" size={20} color={isDarkMode ? '#A78BFA' : '#5856D6'} />
          </View>
          <Text style={styles.actionText}>Receive</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={() => setIsToastVisible(true)}>
          <View style={styles.actionIconWrapper}>
            <Ionicons name="repeat-outline" size={20} color={isDarkMode ? '#A78BFA' : '#5856D6'} />
          </View>
          <Text style={styles.actionText}>Swap</Text>
        </TouchableOpacity>
      </View>

      {/* Tokens List */}
      {(loading ? Array(3).fill(null) : tokens).map((token, index) => (
        <View key={index} style={styles.tokenItem}>
          {loading ? (
            <View style={styles.skeletonCircle} />
          ) : (
            <FastImage source={{ uri: token.icon }} style={styles.tokenIcon} />
          )}

          <View style={styles.tokenInfo}>
            {loading ? <View style={styles.skeletonSmall} /> : <Text style={styles.tokenName}>{token.name}</Text>}
            {loading ? <View style={styles.shimmer} /> : <Text style={styles.tokenPrice}>${token.price}</Text>}
          </View>

          <View style={styles.tokenAmount}>
            {loading ? <View style={styles.skeletonSmall} /> : (
              <Text style={styles.tokenValue}>{isBalanceHidden ? '****' : `$${(token.price * token.amount).toFixed(2)}`}</Text>
            )}
            {loading ? <View style={styles.shimmer} /> : (
              <Text style={styles.tokenQty}>{isBalanceHidden ? '****' : `${token.amount} ${token.symbol}`}</Text>
            )}
          </View>
        </View>
      ))}

      {/* Transaction History */}
      <TouchableOpacity style={styles.historyButton} onPress={() => router.push('/transactions')}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="list-outline" size={28} color={isDarkMode ? '#fff' : '#000'} style={{ marginRight: 10 }} />
          <Text style={styles.historyText}>Transaction history</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={isDarkMode ? '#aaa' : '#333'} />
      </TouchableOpacity>
    </ScrollView>
  );
}
