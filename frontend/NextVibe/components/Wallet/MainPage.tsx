import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, useColorScheme, RefreshControl, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import getBalanceWallet from '@/src/api/wallet.balance';
import formatNumberWithCommas from '@/src/utils/formatedNumberUs';
import { useRouter } from 'expo-router';


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
  
  const fetchBalance = async () => {
    setLoading(true);
    const response = await getBalanceWallet();
    response.slice(1).forEach((tokensObj: any) => {
      const tokensArray = Object.entries(tokensObj).map(([key, value]: [string, any]) => ({
        name: value.name,
        symbol: value.symbol,
        icon: value.icon,
        price: value.price,
        amount: value.amount,
      }));
      setTokens(tokensArray); 
    });
    
    setTotalBalance(`${formatNumberWithCommas(response[0])} $`)
    setLoading(false);
  }
  useEffect(() => {
    fetchBalance()
  }, []);

 
  const onRefresh = () => {
    setRefreshing(true);
    fetchBalance();
    setRefreshing(false);
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: isDarkMode ? 'black' : '#f2f2f2',
      flex: 1,
      padding: 20,
    },
    skeleton: {
        backgroundColor: isDarkMode ? '#333' : '#ddd',
        borderRadius: 8, 
        width: '100%',
        height: 20,
        marginVertical: 4,
        overflow: 'hidden'
     },
    skeletonSmall: { 
        width: 80,
        height: 15,
        backgroundColor: isDarkMode ? '#333' : '#ddd',
        borderRadius: 6, marginVertical: 3
    },
    skeletonCircle: { 
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: isDarkMode ? '#333' : '#ddd',
        marginRight: 15
    },
    shimmer: { 
        width: '40%',
        height: 15,
        backgroundColor: isDarkMode ? '#333' : '#ddd',
        borderRadius: 6,
        marginVertical: 3
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    headerButton: {
      padding: 8,
    },
    balanceText: {
      color: isDarkMode ? '#aaa' : '#555',
      fontSize: 18,
      textAlign: 'center',
    },
    totalBalance: {
      color: isDarkMode ? '#fff' : '#000',
      fontSize: 36,
      fontWeight: 'bold',
      textAlign: 'center',
      marginVertical: 20,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 30,
    },
    circleWrapper: { alignItems: 'center' },
    circleButton: {
      width: 50,
      height: 50,
      backgroundColor: isDarkMode ? '#00CED1' : '#00CED1',
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      borderWidth: 2,
      borderColor: isDarkMode ? '#00CED1' : 'transparent',
    },
    iconColor: {
      color: isDarkMode ? '#fff' : '#fff',
    },
    circleText: {
      color: isDarkMode ? '#00CED1' : '#000',
      fontSize: 16,
    },
    tokenItem: {
      backgroundColor: isDarkMode ? 'black' : '#fff',
      borderRadius: 16,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDarkMode ? '#00CED1' : '#ddd',
    },
    tokenIcon: {
      width: 30,
      height: 30,
      marginRight: 15,
    },
    tokenInfo: {
      flex: 1,
    },
    tokenName: {
      color: isDarkMode ? '#fff' : '#000',
      fontSize: 14,
      fontWeight: 'bold',
    },
    tokenPrice: {
      color: isDarkMode ? '#aaa' : '#555',
      fontSize: 10,
    },
    tokenAmount: {
      alignItems: 'flex-end',
    },
    tokenValue: {
      color: isDarkMode ? '#fff' : '#000',
      fontSize: 14,
      fontWeight: 'bold',
    },
    tokenQty: {
      color: isDarkMode ? '#aaa' : '#555',
      fontSize: 10,
    },
    historyButton: {
      backgroundColor: isDarkMode ? 'black' : '#fff',
      borderWidth: 1,
      borderColor: isDarkMode ? '#00CED1' : '#ccc',
      borderRadius: 12,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    historyText: {
      color: isDarkMode ? '#fff' : '#000',
      fontSize: 18,
      fontWeight: '500',
    },
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDarkMode ? '#fff' : '#000'} />
      }
    >
      <StatusBar backgroundColor={isDarkMode ? "black" : "#fff"}/>  
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.push({ pathname: "/profile" })}>
          <Ionicons name="arrow-back" size={28} color={isDarkMode ? '#fff' : '#000'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="settings-outline" size={28} color={isDarkMode ? '#fff' : '#000'} />
        </TouchableOpacity>
      </View>
      <Text style={styles.balanceText}>Total Balance</Text>
      {loading ? (
        <View style={[styles.skeleton, { height: 40, alignSelf: 'center', width: '50%' }]} />
      ) : (
        <Text style={styles.totalBalance}>{totalBalance}</Text>
      )}
      <View style={styles.buttonContainer}>
        <View style={styles.circleWrapper}>
          <TouchableOpacity style={styles.circleButton} onPress={() => router.push({
              pathname: "/select-token",
              params: {
                from_page: "send"
              }
            })}>
            <Ionicons name="arrow-up" size={28} style={styles.iconColor} />
          </TouchableOpacity>
          <Text style={styles.circleText}>Send</Text>
        </View>
        <View style={styles.circleWrapper}>
          <TouchableOpacity style={styles.circleButton} onPress={() => router.push({
              pathname: "/select-token",
              params: {
                from_page: "deposit"
              }
            })}>
            <Ionicons name="arrow-down" size={28} style={styles.iconColor} />
          </TouchableOpacity>
          <Text style={styles.circleText}>Deposit</Text>
        </View>
        <View style={styles.circleWrapper}>
          <TouchableOpacity style={styles.circleButton}>
            <Ionicons name="swap-horizontal" size={28} style={styles.iconColor} />
          </TouchableOpacity>
          <Text style={styles.circleText}>Swap</Text>
        </View>
      </View>
      {(loading ? Array(3).fill(null) : tokens).map((token, index) => (
        <View key={index} style={styles.tokenItem}>
          {loading ? (
            <View style={styles.skeletonCircle} />
          ) : (
            <Image source={{ uri: token.icon }} style={styles.tokenIcon} />
          )}
          <View style={styles.tokenInfo}>
            {loading ? <View style={styles.skeletonSmall} /> : <Text style={styles.tokenName}>{token.name}</Text>}
            {loading ? <View style={styles.shimmer} /> : <Text style={styles.tokenPrice}>${token.price}</Text>}
          </View>
          <View style={styles.tokenAmount}>
            {loading ? <View style={styles.skeletonSmall} /> : (
              <Text style={styles.tokenValue}>${(token.price * token.amount).toFixed(2)}</Text>
            )}
            {loading ? <View style={styles.shimmer} /> : (
              <Text style={styles.tokenQty}>{token.amount} {token.symbol}</Text>
            )}
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.historyButton}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="list-outline" size={28} color={isDarkMode ? '#fff' : '#000'} style={{ marginRight: 10 }} />
          <Text style={styles.historyText}>Transaction history</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={isDarkMode ? '#aaa' : '#333'} />
      </TouchableOpacity>
    </ScrollView>
  );
}
