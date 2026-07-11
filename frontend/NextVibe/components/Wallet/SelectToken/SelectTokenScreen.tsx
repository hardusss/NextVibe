import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, StyleSheet,
    ScrollView, TouchableOpacity, StatusBar, Keyboard, Platform, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Search, X } from 'lucide-react-native';
import WalletHeader from '@/components/Wallet/Shared/WalletHeader';
import { TOKENS } from '@/constants/Tokens';
import { TokenRow, TokenSkeleton } from '@/components/Wallet/SelectToken/TokenRow';
import { GlassSurface } from '@/components/Shared/GlassSurface';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface Token {
    name: string;
    symbol: string;
    icon: string;
}

export default function SelectTokenScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';

    const transX = useRef(new Animated.Value(0)).current;
    const transY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (Platform.OS === 'ios') {
            const createAnim = (val: Animated.Value, toValue: number, duration: number) => {
                return Animated.sequence([
                    Animated.timing(val, {
                        toValue,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    }),
                    Animated.timing(val, {
                        toValue: 0,
                        duration,
                        useNativeDriver: true,
                        isInteraction: false,
                    })
                ]);
            };

            Animated.loop(
                Animated.parallel([
                    createAnim(transX, 15, 12000),
                    createAnim(transY, 10, 15000)
                ])
            ).start();
        }
    }, []);

    const [tokens, setTokens] = useState<Token[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const mainColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.82)';
    const mutedColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    const inputBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    const placeholderColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';

    const getTokens = useCallback(async () => {
        setLoading(true);
        const allTokens: Token[] = Object.values(TOKENS).map((t) => ({
            icon: t.logoURL,
            symbol: t.symbol,
            name: t.name,
        }));
        setTokens(allTokens);
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { getTokens(); }, [getTokens]));

    const filteredTokens = useMemo(() => {
        const q = search.toLowerCase();
        return tokens.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.symbol.toLowerCase().includes(q)
        );
    }, [tokens, search]);

    const handleSelect = (token: Token) => {
        Keyboard.dismiss();
        router.push({ pathname: '/transaction', params: { ...token } });
    };

    return (
        <View style={styles.root}>
            <AnimatedLinearGradient
                colors={isDark
                    ? ['#0A0410', '#1a0a2e', '#0A0410']
                    : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
                style={[
                    StyleSheet.absoluteFillObject,
                    Platform.OS === 'ios' ? {
                        transform: [
                            { scale: 1.15 },
                            { translateX: transX },
                            { translateY: transY }
                        ]
                    } : null
                ]}
            />
            <StatusBar
                backgroundColor={isDark ? '#0A0410' : '#fff'}
                barStyle={isDark ? 'light-content' : 'dark-content'}
            />

            <WalletHeader title="Select Token" isDark={isDark} />

            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Search */}
                <View style={[
                    styles.searchWrap,
                    Platform.OS === 'ios' && { borderWidth: 0 },
                    Platform.OS !== 'ios' && { backgroundColor: inputBg, borderColor: inputBorder }
                ]}>
                    {Platform.OS === 'ios' && (
                        <GlassSurface
                            style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
                            glassEffectStyle="regular"
                            colorScheme={isDark ? "dark" : "light"}
                            tintColor={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)"}
                        />
                    )}
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: Platform.OS === 'ios' ? 1 : undefined }}>
                        <Search size={16} color={placeholderColor} strokeWidth={1.5} />
                        <TextInput
                            style={[styles.searchInput, { color: mainColor }]}
                            placeholder="Search token..."
                            placeholderTextColor={placeholderColor}
                            value={search}
                            onChangeText={setSearch}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <X size={14} color={placeholderColor} strokeWidth={1.5} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Count hint */}
                {!loading && (
                    <Text style={[styles.countHint, { color: mutedColor }]}>
                        {filteredTokens.length} token{filteredTokens.length !== 1 ? 's' : ''}
                        {search.length > 0 ? ' found' : ' available'}
                    </Text>
                )}

                {/* Token list */}
                {loading ? (
                    <>
                        <TokenSkeleton isDark={isDark} />
                        <TokenSkeleton isDark={isDark} />
                        <TokenSkeleton isDark={isDark} />
                    </>
                ) : filteredTokens.length > 0 ? (
                    filteredTokens.map((token, i) => (
                        <TokenRow
                            key={`${token.symbol}-${i}`}
                            item={token}
                            isDark={isDark}
                            index={i}
                            onPress={() => handleSelect(token)}
                        />
                    ))
                ) : (
                    <View style={styles.emptyWrap}>
                        <Search size={32} color={mutedColor} strokeWidth={1.2} />
                        <Text style={[styles.emptyText, { color: mutedColor }]}>
                            No tokens found for "{search}"
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        height: 46,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Dank Mono',
        fontSize: 14,
        includeFontPadding: false,
        paddingVertical: 0,
    },

    countHint: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        letterSpacing: 0.5,
        marginBottom: 12,
        paddingHorizontal: 4,
    },

    emptyWrap: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 12,
    },
    emptyText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        textAlign: 'center',
    },
});