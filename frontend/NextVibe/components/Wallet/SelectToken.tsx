import { useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  useColorScheme,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import getBalanceWallet from "@/src/api/wallet.balance";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import FastImage from "react-native-fast-image";

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
      paddingHorizontal: 16,
    },
    titleWrapper: {
      flexDirection: "row",
      alignItems: "center",
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
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    searchBox: {
      backgroundColor: themeColors.searchBg,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    searchInput: {
      flex: 1,
      color: themeColors.text,
      fontSize: 16,
      marginLeft: 12,
    },
    tokenItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: themeColors.card,
      padding: 16,
      borderRadius: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDarkTheme ? 0.2 : 0.05,
      shadowRadius: 8,
      elevation: 5,
    },
    tokenInfo: {
      flexDirection: "row",
      alignItems: "center",
    },
    tokenImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 16,
    },
    tokenTextWrapper: {
      justifyContent: "center",
    },
    tokenName: {
      color: themeColors.text,
      fontWeight: "700",
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
      textAlign: "center",
      marginTop: 32,
      fontSize: 16,
    },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeColors.card,
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
      justifyContent: "center",
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
  });

export default function SelectTokenPage() {
  const [tokens, setTokens] = useState<Tokens[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const { from_page }: { from_page: string } = useLocalSearchParams();
  const isDarkTheme = useColorScheme() === "dark";
  const router = useRouter();

  const themeColors = {
    background: isDarkTheme ? "#0A0410" : "#F9FAFB",
    card: isDarkTheme ? "#160A25" : "#FFFFFF",
    text: isDarkTheme ? "#F1F5F9" : "#1E293B",
    textSecondary: isDarkTheme ? "#94A3B8" : "#64748B",
    border: isDarkTheme ? "#2C1D42" : "#E2E8F0",
    searchBg: isDarkTheme ? "#1C112E" : "#F1F5F9",
    searchPlaceholder: isDarkTheme ? "#64748B" : "#94A3B8",
    skeletonHighlight: isDarkTheme ? "#281842" : "#E2E8F0",
  };

  const styles = useMemo(
    () => getStyles(isDarkTheme, themeColors),
    [isDarkTheme]
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
          amount: value.amount,
          usdt: value.usdt,
        })
      );
      allTokens.push(...tokensArray);
    });
    setTokens(allTokens);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, [])
  );

  const filteredTokens = tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(search.toLowerCase()) ||
      token.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const Redirect = (token: Tokens) => {
    if (from_page === "deposit") {
      router.push({
        pathname: "/deposit",
        params: {
          address: token.address,
          icon: token.icon,
          name: token.name,
          symbol: token.symbol,
        },
      });
    } else {
      router.push({
        pathname: "/transaction",
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
    <ScrollView style={styles.container}>
      <StatusBar
        backgroundColor={themeColors.background}
        barStyle={isDarkTheme ? "light-content" : "dark-content"}
      />

      <View style={styles.titleWrapper}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.title}>
          CRYPTO {from_page === "deposit" ? "DEPOSIT" : "SEND"}
        </Text>
      </View>

      <View style={styles.searchBox}>
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
            <TouchableOpacity
              key={index}
              style={styles.tokenItem}
              onPress={() => Redirect(token)}
              activeOpacity={0.8}
            >
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
              <MaterialCommunityIcons
                name="chevron-right"
                size={28}
                style={styles.arrowIcon}
              />
            </TouchableOpacity>
          ))
        : (
          <Text style={styles.noTokensText}>No tokens found</Text>
        )}
    </ScrollView>
  );
}