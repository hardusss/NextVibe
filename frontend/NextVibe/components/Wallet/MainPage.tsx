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
  const [lastTransaction, setLastTransaction] = useState<LastTransactionType | undefined>(undefined);
  const [lastTransactionLoading, setLastTransactionLoading] = useState(true);
  const [lastTransactionTokenPrice, setlastTransactionTokenPrice] = useState<number>(0.0);
  const [isErrorToastVisible, setIsErrorToastVisible] = useState<boolean>(false);
  const [errorToastMessage, setErrorToastMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const getLastTransactionMethod = async (withLoading = false) => {
    if (withLoading) setLastTransactionLoading(true);
    setError(null);

    try {
      const response = await getLastTransaction();
      if (response?.data?.error) {
        throw new Error(response.data.error);
      }
      if (response.data === "null") {
        return;
      }
      const price = Number(Object.entries(response.prices)[0][1]);
      const transaction = response.transaction;

      setlastTransactionTokenPrice(price);
      setLastTransaction(transaction);
    } catch (error: any) {
      const errorMsg =
          error?.response?.data?.error ||
          error?.message ||
          "Failed to load recent transaction";

      setErrorToastMessage(errorMsg);
      setIsErrorToastVisible(true);
      setError("Failed to load recent transaction"); 
    } finally {
      if (withLoading) setLastTransactionLoading(false);
    }
  };

  const fetchBalance = async (withLoading = false) => {
    if (withLoading) setLoading(true);
    setError(null);

    try {
      const response = await getBalanceWallet();
      if (response.length > 1) {
        const tokenData = response[1];
        const tokensArray: Token[] = Object.values(tokenData).map((value: any) => ({
          name: value.name,
          symbol: value.symbol,
          icon: value.icon,
          price: value.price || 0,
          amount: value.amount || 0,
        }));
        setTokens(tokensArray);
      }
      setTotalBalance(`${formatNumberWithCommas(response[0])}`);
    } catch (error) {
      
    } finally {
      if (withLoading) setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const fetchData = () => {
        getLastTransactionMethod(); 
        fetchBalance();            
      };

      fetchBalance(true);
      getLastTransactionMethod(true);

      const interval = setInterval(fetchData, 10000);

      return () => clearInterval(interval);
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await fetchBalance();
    await getLastTransactionMethod();
    setRefreshing(false);
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
    testnetBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      backgroundColor: isDarkMode ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 165, 0, 0.3)',
      borderRadius: 12,
      marginHorizontal: 20,
      marginTop: 10,
    },
    testnetBannerText: {
        color: isDarkMode ? '#FFA500' : '#D2691E',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
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
      minHeight: 82, 
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
    recentActivityErrorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 10,
        justifyContent: 'center',
    },
    recentActivityErrorText: {
        fontSize: 16,
        fontWeight: '600',
        color: isDarkMode ? '#FF6B6B' : '#E74C3C',
        marginLeft: 12,
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
        <Web3Toast
          message={errorToastMessage}
          visible={isErrorToastVisible}
          onHide={() => setIsErrorToastVisible(false)}
          isSuccess={false}
        />
        <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"}/> 
        <View style={styles.testnetBanner}>
            <Ionicons name="flask-outline" size={18} color={isDarkMode ? '#FFA500' : '#D2691E'} />
            <Text style={styles.testnetBannerText}>Testnet Mode</Text>
        </View>

        <View style={styles.topHeader}>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
            
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
          {loading && !refreshing ? (
            <View style={styles.balanceSkeleton} />
          ) : (
            <Text style={styles.totalBalance}>
              {isBalanceHidden ? '* * * * * ' : `${totalBalance} `}
              <Text style={{color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)', fontSize: 32}}>USD</Text>
            </Text>
          )}
        </View>

        <View style={styles.actionButtonsContainer}>
          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
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
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.recentActivityCard}
            onPress={() => {
              if (error) {
                onRefresh(); 
              } else if (lastTransaction) {
                router.push('/transactions');
              }
            }}
            disabled={lastTransactionLoading}
          >
            <BlurView
              intensity={isDarkMode ? 30 : 40}
              tint={isDarkMode ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <View style={styles.recentActivityInnerContent}>
              {lastTransactionLoading ? (
                <>
                  <View style={styles.recentActivityIconBackground}>
                    <View style={[styles.skeletonTokenIcon, {width: 30, height: 30, borderRadius: 15, marginRight: 0}]} />
                  </View>
                  <View style={styles.recentActivityTextContainer}>
                    <View style={[styles.skeletonTokenName, { marginBottom: 6, height: 16 }]} />
                    <View style={[styles.skeletonTokenPrice, { height: 13 }]} />
                  </View>
                  <View style={[styles.skeletonTokenPrice, { width: 50, height: 12 }]} />
                </>
              ) : error ? (
                <View style={styles.recentActivityErrorContainer}>
                  <Ionicons name="alert-circle-outline" size={24} color={isDarkMode ? '#FF6B6B' : '#E74C3C'} />
                  <Text style={styles.recentActivityErrorText}>Failed to load activity</Text>
                </View>
              ) : lastTransaction ? (
                <>
                  <View style={styles.recentActivityIconBackground}>
                    <FastImage
                      source={{
                        uri: lastTransaction.icon,
                      }}
                      style={{ width: 30, height: 30 }}
                    />
                  </View>
                  <View style={styles.recentActivityTextContainer}>
                    <Text style={styles.recentActivityTitle}>
                      {isBalanceHidden
                        ? 'Recent Transaction'
                        : `You ${lastTransaction.direction === "incoming" ? "received" : "sent"} ${Number(lastTransaction.amount.toFixed(8))} ${lastTransaction.blockchain}`
                      }
                    </Text>
                    <Text style={styles.recentActivityDetails}>
                      {isBalanceHidden ? '****' : 
                        `~${Number(Number(Number(lastTransaction.amount.toFixed(8)) * Number(lastTransactionTokenPrice)).toFixed(8))} USD`
                      }
                    </Text>
                  </View>
                  <Text style={styles.recentActivityTime}>
                    {lastTransaction.timestamp 
                      ? timeAgo(new Date(lastTransaction.timestamp * (lastTransaction.blockchain === "TRX" ? 1 : 1000) ).toISOString())
                      : ''}
                  </Text>
                </>
              ) : (
                <View style={styles.recentActivityErrorContainer}>
                  <Ionicons name="document-text-outline" size={24} color={isDarkMode ? '#A09CB8' : '#666'} />
                  <Text style={[styles.recentActivityErrorText, { color: isDarkMode ? '#A09CB8' : '#666' }]}>
                    No recent activity
                  </Text>
                </View>
              )}
            </View>
         </TouchableOpacity>
        </View>


        <View style={styles.portfolioHeader}>
          <Text style={styles.portfolioTitle}>Portfolio</Text>
        </View>

        {(loading && !refreshing ? Array(3).fill(null) : tokens).map((token, index) => (
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
                  <>
                    <View style={[styles.skeletonTokenName, { height: 16, marginBottom: 6 }]} />
                    <View style={[styles.skeletonTokenPrice, { height: 13 }]} />
                  </>
                ) : (
                  <>
                    <Text style={styles.tokenName}>{token.name}</Text>
                    <Text style={styles.tokenPrice}>
                      {token.symbol} ${Number(token.price).toFixed(2)}
                    </Text>
                  </>
                )}
              </View>
            </View>
            <View style={styles.tokenInfoRight}>
              {loading ? (
                <>
                  <View style={[styles.skeletonTokenAmount, { height: 16, marginBottom: 6 }]} />
                  <View style={[styles.skeletonTokenValue, { height: 13 }]} />
                </>
              ) : (
                <>
                  <Text style={styles.tokenAmount}>
                    {isBalanceHidden
                      ? '****'
                      : Number(token.amount).toFixed(8).replace(/\.?0+$/, '')}
                  </Text>
                  <Text style={styles.tokenValue}>
                    {isBalanceHidden
                      ? '****'
                      : `$${Number(token.price * token.amount).toFixed(2)}`}
                  </Text>
                </>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}