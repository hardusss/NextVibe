import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import getBalanceWallet from '@/src/api/wallet.balance';
import formatNumberWithCommas from '@/src/utils/formatedNumberUs';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FastImage from 'react-native-fast-image';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur'; 
import getLastTransaction from '@/src/api/get.last.transaction';
import timeAgo from '@/src/utils/formatTime';

type Token = {
  name: string;
  symbol: string;
  icon: string;
  price: number;
  amount: number;
};

type LastTransactionType = {
  blockchain: string;
  icon: string;
  amount: number;
  timestamp: number;
  direction: string
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
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<LastTransactionType>();
  const [lastTransactionLoading, setLastTransactionLoading] = useState(true);
  const [lastTransactionTokenPrice, setlastTransactionTokenPrice] = useState<number>(0.0);

  const getLastTransactionMethod = async () => {
    setLastTransactionLoading(true);
    const response = await getLastTransaction();
    const price = Number(Object.entries(response.prices)[0][1]);
    const transaction = response.transaction;
    setlastTransactionTokenPrice(price);
    setLastTransaction(transaction);

    setLastTransactionLoading(false);
  };

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const response = await getBalanceWallet();

      if (response.length > 1) {
        const tokenData = response[1];
        const tokensArray: Token[] = Object.values(tokenData).map(
          (value: any) => ({
            name: value.name,
            symbol: value.symbol,
            icon: value.icon,
            price: value.price || 0,
            amount: value.amount || 0,
          }),
        );
        setTokens(tokensArray);
      }
      setTotalBalance(`${formatNumberWithCommas(response[0])}`);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      getLastTransactionMethod();
      fetchBalance();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setLastTransactionLoading(true);
    await fetchBalance();
    await getLastTransactionMethod();
    setRefreshing(false);
    setLastTransactionLoading(false);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    gradientBackground: {
      flex: 1,
    },
    scrollViewContent: {
      paddingBottom: 30,
    },
    topHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      marginBottom: 30,
    },
    rightHeaderGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIconBackground: {
      width: 50,
      height: 54,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden', 
      borderWidth: 1, 
      borderColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(220, 220, 220, 0.5)',
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    balanceSection: {
      alignItems: 'center',
      marginBottom: 30,
    },
    balanceLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
      marginBottom: 8,
    },
    totalBalance: {
      fontSize: 48,
      fontWeight: '800',
      color: isDarkMode ? '#FFFFFF' : '#000000',
      letterSpacing: -2,
      marginBottom: 4,
    },
    balanceSkeleton: {
      width: 200,
      height: 48,
      borderRadius: 12,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(0,0,0,0.1)',
    },
    actionButtonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 10,
      marginBottom: 30,
    },
    actionButtonWrapper: {
      alignItems: 'center',
    },
    actionButton: {
      width: 82,
      height: 72,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      overflow: 'hidden', 
      borderWidth: 0.7, 
      borderColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(220, 220, 220, 0.5)',
    },
    actionButtonText: {
      color: isDarkMode ? '#FFFFFF' : '#000000',
      fontSize: 14,
      fontWeight: '600',
    },
    recentActivityContainer: {
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    recentActivityCard: {
      borderRadius: 20,
      overflow: 'hidden', 
      borderWidth: 0.7, 
      borderColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(220, 220, 220, 0.5)',
    },
    recentActivityInnerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    recentActivityIconBackground: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDarkMode
        ? 'rgba(167, 139, 250, 0.2)'
        : 'rgba(88, 86, 214, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 15,
      borderWidth: 1,
      borderColor: isDarkMode
        ? 'rgba(167, 139, 250, 0.4)'
        : 'rgba(88, 86, 214, 0.3)',
    },
    recentActivityTextContainer: {
      flex: 1,
    },
    recentActivityTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? '#FFFFFF' : '#000000',
      marginBottom: 4,
    },
    recentActivityDetails: {
      fontSize: 13,
      fontWeight: '500',
      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
    },
    recentActivityTime: {
      fontSize: 12,
      color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
    },
    portfolioHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    portfolioTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDarkMode ? '#FFFFFF' : '#000000',
    },
    tokenItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderBottomWidth: 0.5,
      borderBottomColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.1)'
        : 'rgba(0, 0, 0, 0.08)',
    },
    tokenInfoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 15,
    },
    tokenNameDetails: {
      flexDirection: 'column',
    },
    tokenName: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? '#FFFFFF' : '#000000',
    },
    tokenPrice: {
      fontSize: 13,
      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
      marginTop: 2,
    },
    tokenInfoRight: {
      alignItems: 'flex-end',
    },
    tokenAmount: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? '#FFFFFF' : '#000000',
    },
    tokenValue: {
      fontSize: 13,
      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
      marginTop: 2,
    },
    skeletonTokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(0,0,0,0.1)',
      marginRight: 15,
    },
    skeletonTokenName: {
      width: 80,
      height: 18,
      borderRadius: 4,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(0,0,0,0.1)',
      marginBottom: 4,
    },
    skeletonTokenPrice: {
      width: 60,
      height: 15,
      borderRadius: 4,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.08)',
    },
    skeletonTokenAmount: {
      width: 70,
      height: 18,
      borderRadius: 4,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(0,0,0,0.1)',
      marginBottom: 4,
    },
    skeletonTokenValue: {
      width: 90,
      height: 15,
      borderRadius: 4,
      backgroundColor: isDarkMode
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.08)',
    },
  });

  return (
    <LinearGradient
      colors={
        isDarkMode
          ? ['#0A0410', '#1a0a2e', '#0A0410']
          : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
      }
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDarkMode ? '#fff' : '#000'}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Web3Toast
          message="Coming Soon..."
          visible={isToastVisible}
          onHide={() => setIsToastVisible(false)}
          isSuccess={false}
        />
        <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"}/>  

        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.headerIconBackground, {width: 84}]}
            onPress={() => router.replace("/profile")}
          >
            <BlurView
              intensity={isDarkMode ? 40 : 80}
              tint={isDarkMode ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <Ionicons
              name="arrow-back"
              size={24}
              color={isDarkMode ? '#A78BFA' : '#5856D6'}
            />
          </TouchableOpacity>

          <View style={styles.rightHeaderGroup}>
            <TouchableOpacity
              style={styles.headerIconBackground}
              onPress={() => setIsBalanceHidden(!isBalanceHidden)}
            >
              <BlurView
                intensity={isDarkMode ? 40 : 80}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <Ionicons
                name={isBalanceHidden ? 'eye-off-outline' : 'eye-outline'}
                size={24}
                color={isDarkMode ? '#A78BFA' : '#5856D6'}
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.headerIconBackground, { marginLeft: 12 }]}
              onPress={() => router.push('/transactions')}
            >
              <BlurView
                intensity={isDarkMode ? 40 : 80}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <Ionicons
                name="receipt-outline"
                size={24}
                color={isDarkMode ? '#A78BFA' : '#5856D6'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Balance</Text>
          {loading ? (
            <View style={styles.balanceSkeleton} />
          ) : (
            <Text style={styles.totalBalance}>
              {isBalanceHidden ? '*****' : `${totalBalance} `}
              <Text style={{color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)', fontSize: 32}}>USD</Text>
            </Text>
          )}
        </View>

        <View style={styles.actionButtonsContainer}>
          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                router.push({
                  pathname: '/select-token',
                  params: { from_page: 'deposit' },
                })
              }
            >
              <BlurView
                intensity={isDarkMode ? 40 : 40}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <Ionicons
                name="arrow-down-outline"
                size={26}
                color={isDarkMode ? '#A78BFA' : '#5856D6'}
              />
            </TouchableOpacity>
            <Text style={styles.actionButtonText}>Receive</Text>
          </View>

          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                router.push({
                  pathname: '/select-token',
                  params: { from_page: 'send' },
                })
              }
            >
              <BlurView
                intensity={isDarkMode ? 40 : 40}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <Ionicons
                name="arrow-up-outline"
                size={26}
                color={isDarkMode ? '#A78BFA' : '#5856D6'}
              />
            </TouchableOpacity>
            <Text style={styles.actionButtonText}>Send</Text>
          </View>

          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setIsToastVisible(true)}
            >
              <BlurView
                intensity={isDarkMode ? 40 : 40}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <Ionicons
                name="swap-horizontal-outline"
                size={26}
                color={isDarkMode ? '#A78BFA' : '#5856D6'}
              />
            </TouchableOpacity>
            <Text style={styles.actionButtonText}>Swap</Text>
          </View>
        </View>
      <View style={styles.recentActivityContainer}>
          <TouchableOpacity
            style={styles.recentActivityCard}
            onPress={() => router.push('/transactions')}
          >
            <BlurView
              intensity={isDarkMode ? 30 : 40}
              tint={isDarkMode ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
        <View style={styles.recentActivityInnerContent}>
          <View style={styles.recentActivityIconBackground}>
            {lastTransactionLoading ? (
              <View style={[styles.skeletonTokenIcon, {width: 48, height: 48, borderRadius: 24, marginLeft: 13}]} />
            ) : (
              <FastImage
                source={{
                  uri: lastTransaction?.icon,
                }}
                style={{ width: 30, height: 30 }}
              />
            )}
          </View>
          <View style={styles.recentActivityTextContainer}>
            {lastTransactionLoading ? (
              <>
                <View style={[styles.skeletonTokenName, { marginBottom: 6 }]} />
                <View style={styles.skeletonTokenPrice} />
              </>
            ) : (
              <>
                <Text style={styles.recentActivityTitle}>
                  {isBalanceHidden
                    ? 'Recent Transaction'
                    : `You ${lastTransaction?.direction === "incoming" ? "received" : "sent"} ${Number(lastTransaction?.amount.toFixed(8))} ${lastTransaction?.blockchain}`}
                </Text>
                <Text style={styles.recentActivityDetails}>
                  {isBalanceHidden ? '****' : `~${Number(Number(Number(lastTransaction?.amount.toFixed(8)) * Number(lastTransactionTokenPrice)).toFixed(8))} USD`}
                </Text>
              </>
            )}
          </View>
          {lastTransactionLoading ? (
            <View style={[styles.skeletonTokenPrice, { width: 50 }]} />
          ) : (
            <Text style={styles.recentActivityTime}>
              {lastTransaction?.timestamp 
                ? timeAgo(new Date(lastTransaction.timestamp * (lastTransaction.blockchain === "TRX" ? 1 : 1000) ).toISOString())
                : ''}
            </Text>
          )}
        </View>
         </TouchableOpacity>
        </View>


        <View style={styles.portfolioHeader}>
          <Text style={styles.portfolioTitle}>Portfolio</Text>
        </View>

        {(loading ? Array(3).fill(null) : tokens).map((token, index) => (
          <View
            key={index}
            style={styles.tokenItem}
          >
            <View style={styles.tokenInfoLeft}>
              {loading ? (
                <View style={styles.skeletonTokenIcon} />
              ) : (
                <FastImage source={{ uri: token.icon }} style={styles.tokenIcon} />
              )}
              <View style={styles.tokenNameDetails}>
                {loading ? (
                  <View style={styles.skeletonTokenName} />
                ) : (
                  <Text style={styles.tokenName}>{token.name}</Text>
                )}
                {loading ? (
                  <View style={styles.skeletonTokenPrice} />
                ) : (
                  <Text style={styles.tokenPrice}>
                    {token.symbol} ${Number(token.price).toFixed(2)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.tokenInfoRight}>
              {loading ? (
                <View style={styles.skeletonTokenAmount} />
              ) : (
                <Text style={styles.tokenAmount}>
                  {isBalanceHidden
                    ? '****'
                    : Number(token.amount).toFixed(8).replace(/\.?0+$/, '')}
                </Text>
              )}
              {loading ? (
                <View style={styles.skeletonTokenValue} />
              ) : (
                <Text style={styles.tokenValue}>
                  {isBalanceHidden
                    ? '****'
                    : `$${Number(token.price * token.amount).toFixed(2)}`}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}