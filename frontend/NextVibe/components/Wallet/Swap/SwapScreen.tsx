import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Animated,
    Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import usePortfolio, { TokenAsset } from '@/hooks/usePortfolio';
import useWalletAddress from '@/hooks/useWalletAddress';
import SwapCard from './SwapCard';
import SwapFlipButton from './SwapFlipButton';
import SwapSwipeButton from './SwapSwipeButton';
import SwapTokenPicker from './SwapTokenPicker';
import SwapInfoRows from './SwapInfoRows';
import Web3Toast from '@/components/Shared/Toasts/Web3Toast';
import type { SwapColors } from '@/src/types/swap';
import useJupiterSwap from '@/hooks/useJupiterSwap';

/**
 * Sanitizes user input to ensure a valid floating-point number string.
 * Normalizes commas to dots, strips non-numeric characters, and enforces a single decimal point.
 *
 * @param text - Raw input string from the user
 * @returns A sanitized numeric string safe for parseFloat
 */
const sanitize = (text: string): string => {
    let v = text.replace(',', '.').replace(/[^0-9.]/g, '');

    if (v.startsWith('.')) {
        v = '0' + v;
    }

    const dot = v.indexOf('.');
    if (dot !== -1) {
        v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    }

    return v;
};

const DEFAULT_FROM_SYMBOL = 'SOL';
const DEFAULT_TO_SYMBOL = 'USDC';
const RECEIVE_PREFERENCE = ['USDC', 'USDT', 'USDG', 'PYUSD', 'SOL'] as const;

const findToken = (tokens: TokenAsset[], symbol: string) =>
    tokens.find(t => t.symbol === symbol);

const pickCounterToken = (tokens: TokenAsset[], from: TokenAsset): TokenAsset => {
    if (from.symbol !== DEFAULT_TO_SYMBOL) {
        const usdc = findToken(tokens, DEFAULT_TO_SYMBOL);
        if (usdc) return usdc;
    }
    if (from.symbol !== DEFAULT_FROM_SYMBOL) {
        const sol = findToken(tokens, DEFAULT_FROM_SYMBOL);
        if (sol) return sol;
    }
    for (const symbol of RECEIVE_PREFERENCE) {
        const candidate = findToken(tokens, symbol);
        if (candidate && candidate.symbol !== from.symbol) return candidate;
    }
    return tokens.find(t => t.symbol !== from.symbol) ?? tokens[0];
};

/** Picks PAY/RECEIVE defaults from live portfolio (correct mint, balance, price). */
const pickDefaultSwapPair = (tokens: TokenAsset[]): { from: TokenAsset; to: TokenAsset } | null => {
    if (tokens.length === 0) return null;
    if (tokens.length === 1) return { from: tokens[0], to: tokens[0] };

    const withBalance = tokens.filter(t => t.amount > 0);
    const from = withBalance.length > 0
        ? [...withBalance].sort((a, b) => b.valueUsd - a.valueUsd)[0]
        : (findToken(tokens, DEFAULT_FROM_SYMBOL) ?? tokens[0]);

    const to = pickCounterToken(tokens, from);
    return { from, to };
};

const syncTokenFromPortfolio = (
    tokens: TokenAsset[],
    current: TokenAsset | null,
): TokenAsset | null => {
    if (!current) return null;
    return tokens.find(t => t.symbol === current.symbol) ?? current;
};

/**
 * SwapScreen Component
 *
 * The main screen for token-to-token swapping.
 * Implements a bidirectional token amount calculator, token pair selection,
 * a fluid hazy background, and a swipe-to-confirm mechanism.
 *
 * Features:
 * - Bidirectional amount calculation based on live token prices
 * - Animated floating blob background with BlurView overlay (iOS only)
 * - Token pair flip with mirrored amount state
 * - Percentage-based quick fill buttons
 * - Token picker modal for from/to selection
 * - Swap info summary (rate, fees, slippage, price impact)
 * - Swipe-to-confirm CTA with loading/success/failed states
 * - Web3Toast notification for mainnet-only restriction
 * - Safe area inset support for Dynamic Island / status bar
 *
 * @component
 */
export default function SwapScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const { data } = usePortfolio();
    const { address } = useWalletAddress();

    const insets = useSafeAreaInsets();

    const tokens: TokenAsset[] = data?.tokens ?? [];

    const [fromToken, setFromToken] = useState<TokenAsset | null>(null);
    const [toToken, setToToken] = useState<TokenAsset | null>(null);
    const userPickedPair = useRef(false);
    const defaultsApplied = useRef(false);
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');

    const [lastEditedField, setLastEditedField] = useState<'from' | 'to'>('from');
    const [focused, setFocused] = useState<'from' | 'to' | null>(null);
    const [pickerSide, setPickerSide] = useState<'from' | 'to' | null>(null);
    const { quote, isQuoteLoading, quoteError, fetchQuote, clearQuote, executeSwap, isSwapLoading, swapError } = useJupiterSwap();

    // Instead of a fake success toast, we'll use it for swap status
    const [toastMessage, setToastMessage] = useState('');
    const [isToastSuccess, setIsToastSuccess] = useState(false);
    const [isToastVisible, setIsToastVisible] = useState(false);

    const floatAnim1 = useRef(new Animated.Value(0)).current;
    const floatAnim2 = useRef(new Animated.Value(0)).current;
    const floatAnim3 = useRef(new Animated.Value(0)).current;
    const floatAnim4 = useRef(new Animated.Value(0)).current;

    /**
     * Starts looping float animations for all background blobs.
     * Each blob has a unique duration to create an organic, non-synchronized motion.
     * Only runs on iOS since the BlurView overlay is iOS-only.
     */
    useEffect(() => {
        if (Platform.OS !== 'ios') return;

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim1, { toValue: 1, duration: 12000, useNativeDriver: true }),
                Animated.timing(floatAnim1, { toValue: 0, duration: 12000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim2, { toValue: 1, duration: 10000, useNativeDriver: true }),
                Animated.timing(floatAnim2, { toValue: 0, duration: 10000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim3, { toValue: 1, duration: 14000, useNativeDriver: true }),
                Animated.timing(floatAnim3, { toValue: 0, duration: 14000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim4, { toValue: 1, duration: 9000, useNativeDriver: true }),
                Animated.timing(floatAnim4, { toValue: 0, duration: 9000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        userPickedPair.current = false;
        defaultsApplied.current = false;
        setFromToken(null);
        setToToken(null);
        setFromAmount('');
        setToAmount('');
        clearQuote();
    }, [address?.toString(), clearQuote]);

    useEffect(() => {
        if (tokens.length === 0) return;

        if (!userPickedPair.current && !defaultsApplied.current) {
            const pair = pickDefaultSwapPair(tokens);
            if (pair) {
                setFromToken(pair.from);
                setToToken(pair.to);
                defaultsApplied.current = true;
            }
            return;
        }

        setFromToken(prev => syncTokenFromPortfolio(tokens, prev));
        setToToken(prev => syncTokenFromPortfolio(tokens, prev));
    }, [tokens]);

    /**
     * Theme-aware color palette for all child components.
     * Memoized to prevent unnecessary re-renders on unrelated state changes.
     */
    const colors: SwapColors = useMemo(() => ({
        text: isDark ? '#F0EAFF' : '#1A0A3E',
        muted: isDark ? 'rgba(240,234,255,0.45)' : 'rgba(26,10,62,0.45)',
        accent: '#A855F7',
        chip: isDark ? 'rgba(168,85,247,0.15)' : 'rgba(124,58,237,0.1)',
        chipBorder: isDark ? 'rgba(168,85,247,0.3)' : 'rgba(124,58,237,0.2)',
        cardBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.15)',
        modalBg: isDark ? 'rgba(10,4,16,0.97)' : 'rgba(255,255,255,0.97)',
        isDark,
    }), [isDark]);

    useEffect(() => {
        if (!fromToken || !toToken) return;

        const num = parseFloat(fromAmount);
        if (isNaN(num) || num <= 0) {
            setToAmount('');
            clearQuote();
            return;
        }

        const decimals = fromToken.decimals ?? 9;
        const amountRaw = num * Math.pow(10, decimals);

        const delay = setTimeout(() => {
            fetchQuote(fromToken.mint, toToken.mint, amountRaw);
        }, 500); // 500ms debounce

        return () => clearTimeout(delay);
    }, [fromAmount, fromToken, toToken, fetchQuote, clearQuote]);

    // Update toAmount when quote changes
    useEffect(() => {
        if (quote && toToken) {
            const outDecimals = toToken.decimals ?? 9;
            const formattedOut = (Number(quote.outAmount) / Math.pow(10, outDecimals)).toFixed(6);
            setToAmount(formattedOut);
        } else if (!isQuoteLoading) {
            setToAmount('');
        }
    }, [quote, toToken, isQuoteLoading]);

    /**
     * Handles text input changes for the "from" amount field.
     *
     * @param text - Raw input from the TextInput
     */
    const handleFromAmountChange = (text: string) => {
        setLastEditedField('from');
        setFromAmount(sanitize(text));
        setIsToastVisible(false);
    };

    const handleToAmountChange = (text: string) => {
        // We only support EXACT_IN for now via Jupiter Service to keep UI simple
        // So we disable editing the "to" field or ignore it
        // If we want exactOut we'd implement it here
    };

    /**
     * Fills the "from" amount field with a percentage of the user's available balance.
     *
     * @param pct - Decimal percentage (e.g. 0.25 for 25%, 1 for 100%)
     */
    const handlePercentPress = useCallback((pct: number) => {
        if (!fromToken || fromToken.amount <= 0) return;
        setLastEditedField('from');
        setFromAmount((fromToken.amount * pct).toFixed(6));
    }, [fromToken]);

    /**
     * Flips the token pair and mirrors the amounts in both fields.
     * Also flips the lastEditedField to keep the calculator direction consistent.
     */
    const handleFlip = useCallback(() => {
        userPickedPair.current = true;
        setFromToken(toToken);
        setToToken(fromToken);
        setFromAmount(toAmount);
        setToAmount('');
        clearQuote();
        setIsToastVisible(false);
    }, [fromToken, toToken, toAmount, clearQuote]);

    /**
     * Handles token selection from the picker modal.
     *
     * @param token - The TokenAsset selected by the user
     */
    const handleTokenSelect = useCallback((token: TokenAsset) => {
        userPickedPair.current = true;
        if (pickerSide === 'from') {
            setFromToken(token);
            if (toToken?.symbol === token.symbol) {
                setToToken(fromToken);
            }
        } else {
            setToToken(token);
            if (fromToken?.symbol === token.symbol) {
                setFromToken(toToken);
            }
        }
        setPickerSide(null);
        clearQuote();
        setFromAmount('');
        setToAmount('');
        setIsToastVisible(false);
    }, [pickerSide, fromToken, toToken, clearQuote]);

    /**
     * Handles the swipe-to-confirm gesture.
     * Swaps are currently restricted to Mainnet only.
     */
    const handleSwipe = async () => {
        if (!fromToken) {
            setToastMessage('Error: No token selected to send.');
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }
        if (!toToken) {
            setToastMessage('Error: No token selected to receive.');
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }

        const num = parseFloat(fromAmount);
        if (!fromAmount || isNaN(num) || num <= 0) {
            setToastMessage(`Amount is empty or invalid: "${fromAmount}"`);
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }

        if (isQuoteLoading) {
            setToastMessage('Fetching Jupiter quote, please wait...');
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }

        if (quoteError) {
            setToastMessage(`Jupiter API: ${quoteError}`);
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }

        if (!quote) {
            setToastMessage('Route not found (amount may be too small or insufficient liquidity).');
            setIsToastSuccess(false);
            setIsToastVisible(true);
            return;
        }

        const { signature, error } = await executeSwap();

        if (signature) {
            setToastMessage(`Success! tx: ${signature.slice(0, 8)}...`);
            setIsToastSuccess(true);
            setIsToastVisible(true);
            setFromAmount('');
            setToAmount('');
            clearQuote();
            setTimeout(() => {
                setIsToastVisible(false);
            }, 2500);
        } else {
            setToastMessage(error || 'Transaction execution failed.');
            setIsToastSuccess(false);
            setIsToastVisible(true);
            setTimeout(() => {
                setIsToastVisible(false);
            }, 2500);
        }
    };
    const { disabled, disabledLabel } = useMemo(() => {
        if (!fromToken || !toToken) {
            return { disabled: true, disabledLabel: 'Select tokens' };
        }
        const parsedAmount = parseFloat(fromAmount);
        if (!fromAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return { disabled: true, disabledLabel: 'Enter amount' };
        }
        if (parsedAmount > (fromToken.amount ?? 0)) {
            return { disabled: true, disabledLabel: 'Insufficient balance' };
        }
        if (isQuoteLoading) {
            return { disabled: true, disabledLabel: 'Finding best route...' };
        }
        if (quoteError) {
            return { disabled: true, disabledLabel: 'No route available' };
        }
        if (!quote) {
            return { disabled: true, disabledLabel: 'Pair unavailable' };
        }
        return { disabled: false, disabledLabel: 'swipe to swap' };
    }, [fromToken, toToken, fromAmount, isQuoteLoading, quoteError, quote]);

    /**
     * Filters the token list to exclude the token already selected on the opposite side.
     *
     * @param side - Which picker is open ('from' or 'to')
     * @returns Filtered array of selectable tokens
     */
    const availableTokens = useCallback((side: 'from' | 'to') => {
        const other = side === 'from' ? toToken?.symbol : fromToken?.symbol;
        return tokens.filter(t => t.symbol !== other);
    }, [tokens, fromToken, toToken]);

    // Omit display rate since SwapInfoRows will handle it

    const blob1Transform = [
        { translateX: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) },
        { translateY: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
        { scale: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) },
    ];

    const blob2Transform = [
        { translateX: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
        { translateY: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
        { scale: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
    ];

    const blob3Transform = [
        { translateX: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
        { translateY: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
        { scale: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
    ];

    const blob4Transform = [
        { translateX: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) },
        { translateY: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
        { scale: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
    ];

    return (
        <View style={styles.root}>
            <StatusBar
                style={isDark ? 'light' : 'dark'}
                translucent={false}
                backgroundColor={isDark ? '#0A0410' : '#FFFFFF'}
            />

            <LinearGradient
                colors={
                    isDark
                        ? ["#0A0410", "#1a0a2e", "#0A0410"]
                        : ["#FFFFFF", "#dbd4fbff", "#d7cdf2ff"]
                }
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/*
             * Animated blob layer — iOS only.
             * On Android, BlurView from @react-native-community/blur does not support
             * rendering over arbitrary native views and will crash. The LinearGradient
             * background above provides sufficient visual depth on Android.
             */}
            {Platform.OS === 'ios' && (
                <View style={StyleSheet.absoluteFill}>
                    <Animated.View
                        style={[
                            styles.blobTopLeft,
                            { transform: blob1Transform },
                            { backgroundColor: isDark ? '#6B21A8' : '#C084FC' },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.blobBottomRight,
                            { transform: blob2Transform },
                            { backgroundColor: isDark ? '#3B0764' : '#A855F7' },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.blobMiddleLeft,
                            { transform: blob3Transform },
                            { backgroundColor: isDark ? '#4A148C' : '#CE93D8' },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.blobMiddleRight,
                            { transform: blob4Transform },
                            { backgroundColor: isDark ? '#311B92' : '#B39DDB' },
                        ]}
                    />

                    <BlurView
                        style={StyleSheet.absoluteFill}
                        blurType={isDark ? 'dark' : 'light'}
                        blurAmount={90}
                        reducedTransparencyFallbackColor={isDark ? '#0A0410' : '#FFFFFF'}
                    />
                </View>
            )}

            <Web3Toast
                message={toastMessage}
                visible={isToastVisible}
                onHide={() => setIsToastVisible(false)}
                isSuccess={isToastSuccess}
            />

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, flex: 1 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[
                            styles.iconBtn,
                            {
                                borderColor: colors.cardBorder,
                                backgroundColor: colors.chip,
                            },
                        ]}
                    >
                        <ArrowLeft size={18} color={colors.text} strokeWidth={1.8} />
                    </TouchableOpacity>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Swap Tokens
                    </Text>

                    <View
                        style={[
                            styles.slippagePill,
                            {
                                borderColor: colors.chipBorder,
                                backgroundColor: colors.chip,
                            },
                        ]}
                    >
                        <Text style={[styles.slippageText, { color: colors.muted }]}>
                            ⚙ 0.5%
                        </Text>
                    </View>
                </View>

                <SwapCard
                    label="PAY"
                    token={fromToken}
                    amount={fromAmount}
                    isFocused={focused === 'from'}
                    colors={colors}
                    onAmountChange={handleFromAmountChange}
                    onFocus={() => setFocused('from')}
                    onBlur={() => setFocused(null)}
                    onTokenPress={() => setPickerSide('from')}
                    showPercentButtons
                    onPercentPress={handlePercentPress}
                />

                <SwapFlipButton colors={colors} onPress={handleFlip} />

                <SwapCard
                    label="RECEIVE"
                    token={toToken}
                    amount={toAmount}
                    isFocused={focused === 'to'}
                    colors={colors}
                    onAmountChange={undefined} // Disabled for EXACT_IN mode
                    onFocus={() => setFocused('to')}
                    onBlur={() => setFocused(null)}
                    onTokenPress={() => setPickerSide('to')}
                    isLoading={isQuoteLoading}
                />

                <SwapInfoRows
                    fromSymbol={fromToken?.symbol ?? null}
                    toSymbol={toToken?.symbol ?? null}
                    quote={quote}
                    colors={colors}
                />

                <View style={styles.swipeWrap}>
                    <SwapSwipeButton
                        onSwipeSuccess={handleSwipe}
                        isLoading={isSwapLoading}
                        isSuccess={isToastSuccess && isToastVisible}
                        isFailed={!isToastSuccess && isToastVisible}
                        colors={colors}
                        disabled={disabled}
                        disabledLabel={disabledLabel}
                    />
                </View>
            </ScrollView>

            <SwapTokenPicker
                visible={pickerSide !== null}
                tokens={pickerSide ? availableTokens(pickerSide) : []}
                selectedSymbol={pickerSide === 'from' ? fromToken?.symbol ?? null : toToken?.symbol ?? null}
                colors={colors}
                onSelect={handleTokenSelect}
                onClose={() => setPickerSide(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scroll: {
        paddingHorizontal: 20,
        paddingBottom: 120,
    },
    blobTopLeft: {
        position: 'absolute',
        width: 350,
        height: 350,
        borderRadius: 175,
        top: '10%',
        left: '-20%',
        opacity: 0.6,
    },
    blobBottomRight: {
        position: 'absolute',
        width: 450,
        height: 450,
        borderRadius: 225,
        bottom: '5%',
        right: '-30%',
        opacity: 0.5,
    },
    blobMiddleLeft: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        top: '40%',
        left: '-15%',
        opacity: 0.6,
    },
    blobMiddleRight: {
        position: 'absolute',
        width: 380,
        height: 380,
        borderRadius: 190,
        bottom: '30%',
        right: '-10%',
        opacity: 0.5,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        includeFontPadding: false,
    },
    slippagePill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    slippageText: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
    swipeWrap: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
    },
});