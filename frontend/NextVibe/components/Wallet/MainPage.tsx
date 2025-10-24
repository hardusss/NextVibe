import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme, RefreshControl, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import getBalanceWallet from '@/src/api/wallet.balance';
import formatNumberWithCommas from '@/src/utils/formatedNumberUs';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
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
  const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
  
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

  useFocusEffect(
    useCallback(() => {
      fetchBalance()
    }, []) 
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBalance();
    setRefreshing(false);
  };

  const styles = StyleSheet.create({
    container: {
        backgroundColor: isDarkMode ? '#0A0410' : '#f2f2f2',
        flex: 1,
        padding: 20,
    },
    skeleton: {
        backgroundColor: isDarkMode ? '#1C112E' : '#ddd',
        borderRadius: 8,
        width: '100%',
        height: 20,
        marginVertical: 4,
    },
    skeletonSmall: {
        width: 80,
        height: 15,
        backgroundColor: isDarkMode ? '#1C112E' : '#ddd',
        borderRadius: 6,
        marginVertical: 3,
    },
    skeletonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDarkMode ? '#1C112E' : '#ddd',
        marginRight: 15,
    },
    shimmer: {
        width: '40%',
        height: 15,
        backgroundColor: isDarkMode ? '#1C112E' : '#ddd',
        borderRadius: 6,
        marginVertical: 3,
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
        color: isDarkMode ? '#A09CB8' : '#555',
        fontSize: 16,
        textAlign: 'center',
    },
    totalBalance: {
        color: isDarkMode ? '#FFFFFF' : '#000',
        fontSize: 42,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 10,
    },
    buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
},
circleWrapper: {
    alignItems: 'center',
},
circleButton: {
    width: 82,
    height: 64,
    borderRadius: 16,
    backgroundColor: isDarkMode ? '#180F2E' : '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: isDarkMode ? '#A78BFA' : '#ccc',
},
iconColor: {
    color: isDarkMode ? '#A78BFA' : '#333',
},
circleText: {
    color: isDarkMode ? '#A09CB8' : '#555',
    fontSize: 14,
    fontWeight: '500',
},
    tokenItem: {
        backgroundColor: isDarkMode ? '#180F2E' : '#fff',
        borderRadius: 16,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    tokenIcon: {
        width: 40,
        height: 40,
        marginRight: 15,
    },
    tokenInfo: {
        flex: 1,
    },
    tokenName: {
        color: isDarkMode ? '#FFFFFF' : '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    tokenPrice: {
        color: isDarkMode ? '#A09CB8' : '#555',
        fontSize: 12,
    },
    tokenAmount: {
        alignItems: 'flex-end',
    },
    tokenValue: {
        color: isDarkMode ? '#FFFFFF' : '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    tokenQty: {
        color: isDarkMode ? '#A09CB8' : '#555',
        fontSize: 12,
    },
    historyButton: {
        backgroundColor: isDarkMode ? '#180F2E' : '#fff',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    historyText: {
        color: isDarkMode ? '#FFFFFF' : '#000',
        fontSize: 16,
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
      <Web3Toast message='Coming Soon...' visible={isToastVisible} onHide={() => setIsToastVisible(false)}/>
      <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"}/>  
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={isDarkMode ? '#fafafa' : '#000'} />
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
            <Ionicons name="paper-plane-outline" size={22} style={styles.iconColor} />
            <Text style={styles.circleText}>Send</Text>
          </TouchableOpacity>
          
        </View>
        <View style={styles.circleWrapper}>
          <TouchableOpacity style={styles.circleButton} onPress={() => router.push({
              pathname: "/select-token",
              params: {
                from_page: "deposit"
              }
            })}>
            <Ionicons name="download-outline" size={22} style={styles.iconColor} />
             <Text style={styles.circleText}>Receive</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.circleWrapper}>
          <TouchableOpacity style={styles.circleButton} onPress={() => setIsToastVisible(true)}>
            <Ionicons name="repeat-outline" size={22} style={styles.iconColor} />
             <Text style={styles.circleText}>Swap</Text>
          </TouchableOpacity>
        </View>
      </View>
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
              <Text style={styles.tokenValue}>${(token.price * token.amount).toFixed(2)}</Text>
            )}
            {loading ? <View style={styles.shimmer} /> : (
              <Text style={styles.tokenQty}>{token.amount} {token.symbol}</Text>
            )}
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.historyButton} onPress={() => router.push("/transactions")}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="list-outline" size={28} color={isDarkMode ? '#fff' : '#000'} style={{ marginRight: 10 }} />
          <Text style={styles.historyText}>Transaction history</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={isDarkMode ? '#aaa' : '#333'} />
      </TouchableOpacity>
    </ScrollView>
  );
}
