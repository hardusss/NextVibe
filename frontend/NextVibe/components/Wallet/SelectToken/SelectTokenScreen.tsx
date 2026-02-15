import React, { useState, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  useColorScheme,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Data
import { TOKENS } from '@/constants/Tokens';

// Styles & Components
import { createSelectTokenStyles, getThemeColors } from '@/styles/select.token.styles';
import { TokenRow, TokenSkeleton } from '@/components/Wallet/SelectToken/TokenRow';

interface Token {
  name: string;
  symbol: string;
  icon: string;
}

export default function SelectTokenScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  
  // Styles initialization
  const colors = useMemo(() => getThemeColors(isDark), [isDark]);
  const styles = useMemo(() => createSelectTokenStyles(isDark, colors), [isDark, colors]);

  // State
  const [tokens, setTokens] = useState<Token[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Logic
  const getTokens = useCallback(async () => {
    setLoading(true);
    const allTokens: Token[] = Object.values(TOKENS).map((value) => ({
      icon: value.logoURL,
      symbol: value.symbol,
      name: value.name,
    }));
    setTokens(allTokens);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { getTokens(); }, [getTokens]));

  const filteredTokens = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return tokens.filter(t => 
      t.name.toLowerCase().includes(lowerSearch) || 
      t.symbol.toLowerCase().includes(lowerSearch)
    );
  }, [tokens, search]);

  const handleSelectToken = (token: Token) => {
    router.push({
        pathname: '/transaction',
        params: { ...token },
    });
  };

  return (
    <LinearGradient
      colors={isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"} barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={styles.titleWrapper}>
          <TouchableOpacity 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="arrow-left" size={28} color={colors.iconColor} style={styles.backIcon} />
          </TouchableOpacity>
          <Text style={styles.title}>Select Token</Text>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <BlurView intensity={isDark ? 30 : 90} tint={isDark ? 'dark' : 'light'} style={styles.blurViewAbsolute} />
          <View style={styles.searchBoxContent}>
            <MaterialCommunityIcons name="magnify" size={24} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search token..."
              placeholderTextColor={colors.searchPlaceholder}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>
        </View>

        {/* List */}
        {loading ? (
           [...Array(3)].map((_, i) => <TokenSkeleton key={i} styles={styles} />)
        ) : filteredTokens.length > 0 ? (
          filteredTokens.map((token, index) => (
            <TokenRow 
                key={`${token.symbol}-${index}`}
                item={token}
                isDark={isDark}
                styles={styles}
                onPress={() => handleSelectToken(token)}
            />
          ))
        ) : (
          <Text style={styles.noTokensText}>No tokens found</Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
}