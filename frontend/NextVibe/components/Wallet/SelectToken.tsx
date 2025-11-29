import { useState, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  useColorScheme,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import getBalanceWallet from '@/src/api/wallet.balance';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface Tokens {
  address: string;
  name: string;
  symbol: string;
  icon: string;
  amount: number;
  usdt: number;
}

const getStyles = (isDarkTheme: boolean, themeColors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    scrollContentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 30, 
    },
    titleWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
      marginTop: 16, 
    },
    backIcon: {
      color: themeColors.text,
      marginRight: 12,
    },
    title: {
      color: themeColors.text,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: themeColors.border,
      overflow: 'hidden', 
    },
    searchBoxContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    searchInput: {
      flex: 1,
      color: themeColors.text,
      fontSize: 16,
      marginLeft: 12,
    },
    tokenItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
      overflow: 'hidden', 
    },
    tokenItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: "space-between",
      padding: 16,
      width: "100%",
    },
    tokenInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tokenImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 16,
    },
    tokenTextWrapper: {
      justifyContent: 'center',
    },
    tokenName: {
      color: themeColors.text,
      fontWeight: '700',
      fontSize: 17,
    },
    tokenSymbol: {
      color: themeColors.textSecondary,
      fontSize: 14,
    },
    arrowIcon: {
      color: themeColors.textSecondary,
    },
    noTokensText: {
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginTop: 32,
      fontSize: 16,
    },

    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDarkTheme
        ? 'rgba(255, 255, 255, 0.05)'
        : 'rgba(255, 255, 255, 0.7)',
      padding: 16,
      borderRadius: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    skeletonCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: themeColors.skeletonHighlight,
      marginRight: 16,
    },
    skeletonTextBlock: {
      flex: 1,
      justifyContent: 'center',
    },
    skeletonLineShort: {
      width: 80,
      height: 16,
      backgroundColor: themeColors.skeletonHighlight,
      borderRadius: 8,
      marginBottom: 8,
    },
    skeletonLineLong: {
      width: 120,
      height: 14,
      backgroundColor: themeColors.skeletonHighlight,
      borderRadius: 8,
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
  });

export default function SelectTokenPage() {
  const [tokens, setTokens] = useState<Tokens[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const { from_page }: { from_page: string } = useLocalSearchParams();
  const isDarkTheme = useColorScheme() === 'dark';
  const router = useRouter();


  const themeColors = {
    background: 'transparent', 
    text: isDarkTheme ? '#F1F5F9' : '#1E293B',
    textSecondary: isDarkTheme ? '#94A3B8' : '#64748B',
    border: isDarkTheme 
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(220, 220, 220, 0.5)',
    searchPlaceholder: isDarkTheme ? '#64748B' : '#94A3B8',
    skeletonHighlight: isDarkTheme
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.08)',
  };

  const styles = useMemo(
    () => getStyles(isDarkTheme, themeColors),
    [isDarkTheme],
  );

  const fetchBalance = async () => {
    setLoading(true);
    const response = await getBalanceWallet();
    const allTokens: Tokens[] = [];
    response.slice(1).forEach((tokensObj: any) => {
      const tokensArray = Object.entries(tokensObj).map(
        ([key, value]: [string, any]) => ({
          address: value.address,
          name: value.name,
          symbol: value.symbol,
          icon: value.icon,
          amount: value.amount || 0, 
          usdt: value.usdt || 0,
        }),
      );
      allTokens.push(...tokensArray);
    });
    setTokens(allTokens);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, []),
  );

  const filteredTokens = tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(search.toLowerCase()) ||
      token.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  const Redirect = (token: Tokens) => {
    if (from_page === 'deposit') {
      router.push({
        pathname: '/deposit',
        params: {
          address: token.address,
          icon: token.icon,
          name: token.name,
          symbol: token.symbol,
        },
      });
    } else {
      router.push({
        pathname: '/transaction',
        params: {
          address: token.address,
          icon: token.icon,
          name: token.name,
          balance: token.amount,
          symbol: token.symbol,
          usdt: token.usdt,
        },
      });
    }
  };

  return (
    <LinearGradient
      colors={
        isDarkTheme
          ? ['#0A0410', '#1a0a2e', '#0A0410']
          : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
      }
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer} 
      >
        <StatusBar backgroundColor={isDarkTheme ? "#0A0410" : "#fff"}/>  

        <View style={styles.titleWrapper}>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={28}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <Text style={styles.title}>
            CRYPTO {from_page === 'deposit' ? 'DEPOSIT' : 'SEND'}
          </Text>
        </View>

        <View style={styles.searchBox}>
          <BlurView
            intensity={isDarkTheme ? 30 : 90}
            tint={isDarkTheme ? 'dark' : 'light'}
            style={styles.blurViewAbsolute}
          />
          <View style={styles.searchBoxContent}>
            <MaterialCommunityIcons
              name="magnify"
              size={24}
              color={themeColors.textSecondary}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search token..."
              placeholderTextColor={themeColors.searchPlaceholder}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {loading
          ? [...Array(3)].map((_, index) => (
              <View key={index} style={styles.skeletonRow}>
                <View style={styles.skeletonCircle} />
                <View style={styles.skeletonTextBlock}>
                  <View style={styles.skeletonLineShort} />
                  <View style={styles.skeletonLineLong} />
                </View>
              </View>
            ))
          : filteredTokens.length > 0
          ? filteredTokens.map((token, index) => (
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                key={index}
                style={styles.tokenItem}
                onPress={() => Redirect(token)}
                activeOpacity={0.8}
              >
                <BlurView
                  intensity={isDarkTheme ? 30 : 90}
                  tint={isDarkTheme ? 'dark' : 'light'}
                  style={styles.blurViewAbsolute}
                />
                <View style={styles.tokenItemContent}>
                  <View style={styles.tokenInfo}>
                    <FastImage
                      source={{ uri: token.icon }}
                      style={styles.tokenImage}
                    />
                    <View style={styles.tokenTextWrapper}>
                      <Text style={styles.tokenName}>{token.symbol}</Text>
                      <Text style={styles.tokenSymbol}>{token.name}</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={28} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>
            ))
          : (
            <Text style={styles.noTokensText}>No tokens found</Text>
          )}
      </ScrollView>
    </LinearGradient>
  );
}