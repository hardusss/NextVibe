import { useState, useCallback } from "react";
import { ScrollView, View, Image, Text, TextInput, useColorScheme, StyleSheet, StatusBar, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import getBalanceWallet from "@/src/api/wallet.balance";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";

interface Tokens {
  address: string
  name: string;
  symbol: string;
  icon: string;
  amount: number;
  usdt: number
}

export default function SelectTokenPage() {
  const [tokens, setTokens] = useState<Tokens[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const { from_page }: { from_page: string } = useLocalSearchParams();
  const isDarkTheme = useColorScheme() === "dark";
  const router = useRouter();
  const fetchBalance = async () => {
    setLoading(true);
    const response = await getBalanceWallet();
    const allTokens: Tokens[] = [];
    response.slice(1).forEach((tokensObj: any) => {
      const tokensArray = Object.entries(tokensObj).map(([key, value]: [string, any]) => ({
        address: value.address,
        name: value.name,
        symbol: value.symbol,
        icon: value.icon,
        amount: value.amount,
        usdt: value.usdt
      }));
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
          symbol: token.symbol
        }
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
          usdt: token.usdt
        }
      });
    }
  }
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkTheme ? "#000" : "#fff",
      padding: 16,
    },
    titleWrapper: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    backIcon: {
      color: isDarkTheme ? "#fff" : "#000",
      marginRight: 12,
    },
    title: {
      color: isDarkTheme ? "#fff" : "#000",
      fontSize: 22,
      fontWeight: "bold",
    },
    searchBox: {
      backgroundColor: isDarkTheme ? "#1a1a1a" : "#f2f2f2",
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 20,
    },
    searchInput: {
      flex: 1,
      color: isDarkTheme ? "#fff" : "#000",
      fontSize: 16,
      marginLeft: 12,
    },
    tokenItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDarkTheme ? "#121212" : "#f9f9f9",
      padding: 14,
      borderRadius: 14,
      marginBottom: 14,
    },
    tokenInfo: {
      flexDirection: "row",
      alignItems: "center",
    },
    tokenImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 14,
    },
    tokenTextWrapper: {
      justifyContent: "center",
    },
    tokenName: {
      color: isDarkTheme ? "#fff" : "#000",
      fontWeight: "600",
      fontSize: 17,
    },
    tokenSymbol: {
      color: isDarkTheme ? "#888" : "#555",
      fontSize: 13,
    },
    arrowIcon: {
      color: "#00C2CB",
    },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDarkTheme ? "#121212" : "#f0f0f0",
      padding: 14,
      borderRadius: 14,
      marginBottom: 14,
    },
    skeletonCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDarkTheme ? "#222" : "#ddd",
      marginRight: 14,
    },
    skeletonTextBlock: {
      flex: 1,
      justifyContent: "center",
    },
    skeletonLineShort: {
      width: 80,
      height: 14,
      backgroundColor: isDarkTheme ? "#222" : "#ddd",
      borderRadius: 8,
      marginBottom: 8,
    },
    skeletonLineLong: {
      width: 140,
      height: 12,
      backgroundColor: isDarkTheme ? "#222" : "#ddd",
      borderRadius: 8,
    },
  });

  return (
    <ScrollView style={styles.container}>
      <StatusBar backgroundColor={isDarkTheme ? "black" : "#fff"} barStyle={isDarkTheme ? "light-content" : "dark-content"} />

     
      <View style={styles.titleWrapper}>
        <TouchableOpacity onPress={() => router.push("/wallet")}>
          <MaterialCommunityIcons name="arrow-left" size={28} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.title}>CRYPTO {from_page === "deposit" ? "DEPOSIT" : "SEND"}</Text>
      </View>

      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={26} color={isDarkTheme ? "#fff" : "#000"} />
        <TextInput
          style={styles.searchInput}
          placeholder="Token search..."
          placeholderTextColor={isDarkTheme ? "#aaa" : "#555"}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        [...Array(3)].map((_, index) => (
          <View key={index} style={styles.skeletonRow}>
            <View style={styles.skeletonCircle} />
            <View style={styles.skeletonTextBlock}>
              <View style={styles.skeletonLineShort} />
              <View style={styles.skeletonLineLong} />
            </View>
          </View>
        ))
      ) : filteredTokens.length > 0 ? (
        filteredTokens.map((token, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.tokenItem} 
            onPress={() => Redirect(token)}
          >
            <View style={styles.tokenInfo}>
              <Image source={{ uri: token.icon }} style={styles.tokenImage} />
              <View style={styles.tokenTextWrapper}>
                <Text style={styles.tokenName}>{token.symbol}</Text>
                <Text style={styles.tokenSymbol}>{token.name}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={28} style={styles.arrowIcon} />
          </TouchableOpacity>
        ))
      ) : (
        <Text style={{ color: isDarkTheme ? "#fff" : "#000" }}>No tokens found</Text>
      )}
    </ScrollView>
  );
}
