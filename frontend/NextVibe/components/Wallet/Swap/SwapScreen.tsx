import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import usePortfolio, { TokenAsset } from '@/hooks/usePortfolio';
import SwapCard from './SwapCard';
import SwapFlipButton from './SwapFlipButton';
import SwapSwipeButton from './SwapSwipeButton';
import SwapTokenPicker from './SwapTokenPicker';
import SwapInfoRows from './SwapInfoRows';
import Web3Toast from '@/components/Shared/Toasts/Web3Toast';
import type { SwapColors } from '@/src/types/swap';

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

/**
 * SwapScreen Component
 *
 * The main screen for token-to-token swapping.
 * Implements a bidirectional token amount calculator, token pair selection,
 * a fluid hazy background, and a swipe-to-confirm mechanism.
 *
 * Features:
 * - Bidirectional amount calculation based on live token prices
 * - Animated floating blob background with BlurView overlay
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

    const insets = useSafeAreaInsets();

    const tokens: TokenAsset[] = data.tokens;

    const [fromToken, setFromToken] = useState<TokenAsset | null>(null);
    const [toToken, setToToken] = useState<TokenAsset | null>(null);
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');

    const [lastEditedField, setLastEditedField] = useState<'from' | 'to'>('from');
    const [focused, setFocused] = useState<'from' | 'to' | null>(null);
    const [pickerSide, setPickerSide] = useState<'from' | 'to' | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isFailed, setIsFailed] = useState(false);

    /**
     * Controls visibility of the mainnet-only Web3Toast notification.
     * Triggered when the user attempts to confirm a swap on devnet.
     */
    const [isToastVisible, setIsToastVisible] = useState(false);

    // Animated values for the four floating background blobs
    const floatAnim1 = useRef(new Animated.Value(0)).current;
    const floatAnim2 = useRef(new Animated.Value(0)).current;
    const floatAnim3 = useRef(new Animated.Value(0)).current;
    const floatAnim4 = useRef(new Animated.Value(0)).current;

    /**
     * Starts looping float animations for all background blobs.
     * Each blob has a unique duration to create an organic, non-synchronized motion.
     */
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim1, { toValue: 1, duration: 12000, useNativeDriver: true }),
                Animated.timing(floatAnim1, { toValue: 0, duration: 12000, useNativeDriver: true })
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim2, { toValue: 1, duration: 10000, useNativeDriver: true }),
                Animated.timing(floatAnim2, { toValue: 0, duration: 10000, useNativeDriver: true })
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim3, { toValue: 1, duration: 14000, useNativeDriver: true }),
                Animated.timing(floatAnim3, { toValue: 0, duration: 14000, useNativeDriver: true })
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim4, { toValue: 1, duration: 9000, useNativeDriver: true }),
                Animated.timing(floatAnim4, { toValue: 0, duration: 9000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    /**
     * Pre-selects the first two available tokens as the default swap pair
     * once the portfolio data has loaded.
     */
    useEffect(() => {
        if (tokens.length > 0 && !fromToken) {
            setFromToken(tokens[0]);
        }
        if (tokens.length > 1 && !toToken) {
            setToToken(tokens[1]);
        }
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

    /**
     * Bidirectional amount calculator.
     * Recalculates the opposite field whenever the user edits either amount
     * or the token pair changes. Tracks which field was last edited to avoid
     * circular updates.
     */
    useEffect(() => {
        if (!fromToken || !toToken) return;

        const fromPrice = fromToken.price;
        const toPrice = toToken.price;

        if (fromPrice <= 0 || toPrice <= 0) return;

        if (lastEditedField === 'from') {
            const num = parseFloat(fromAmount);
            if (isNaN(num) || num <= 0) {
                setToAmount('');
                return;
            }
            setToAmount((num * fromPrice / toPrice).toFixed(6));
        } else if (lastEditedField === 'to') {
            const num = parseFloat(toAmount);
            if (isNaN(num) || num <= 0) {
                setFromAmount('');
                return;
            }
            setFromAmount((num * toPrice / fromPrice).toFixed(6));
        }
    }, [fromAmount, toAmount, fromToken, toToken, lastEditedField]);

    /**
     * Handles text input changes for the "from" amount field.
     * Marks this field as the last edited so the calculator updates "to".
     *
     * @param text - Raw input from the TextInput
     */
    const handleFromAmountChange = (text: string) => {
        setLastEditedField('from');
        setFromAmount(sanitize(text));
    };

    /**
     * Handles text input changes for the "to" amount field.
     * Marks this field as the last edited so the calculator updates "from".
     *
     * @param text - Raw input from the TextInput
     */
    const handleToAmountChange = (text: string) => {
        setLastEditedField('to');
        setToAmount(sanitize(text));
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
        setFromToken(toToken);
        setToToken(fromToken);
        setFromAmount(toAmount);
        setToAmount(fromAmount);
        setLastEditedField(prev => prev === 'from' ? 'to' : 'from');
    }, [fromToken, toToken, fromAmount, toAmount]);

    /**
     * Handles token selection from the picker modal.
     * Assigns the chosen token to the correct side (from/to) and closes the picker.
     *
     * @param token - The TokenAsset selected by the user
     */
    const handleTokenSelect = useCallback((token: TokenAsset) => {
        if (pickerSide === 'from') {
            setFromToken(token);
        } else {
            setToToken(token);
        }
        setPickerSide(null);
    }, [pickerSide]);

    /**
     * Handles the swipe-to-confirm gesture.
     * Swaps are currently restricted to Mainnet only —
     * shows a Web3Toast notification to inform the user.
     */
    const handleSwipe = async () => {
        setIsToastVisible(true);
    };

    /**
     * Filters the token list to exclude the token already selected on the opposite side,
     * preventing the user from selecting the same token for both from and to.
     *
     * @param side - Which picker is open ('from' or 'to')
     * @returns Filtered array of selectable tokens
     */
    const availableTokens = useCallback((side: 'from' | 'to') => {
        const other = side === 'from' ? toToken?.symbol : fromToken?.symbol;
        return tokens.filter(t => t.symbol !== other);
    }, [tokens, fromToken, toToken]);

    /**
     * Computes the display exchange rate between the selected token pair.
     * Returns null if either token is missing or has an invalid price.
     */
    const displayRate = fromToken?.price && toToken?.price && toToken.price > 0
        ? (fromToken.price / toToken.price).toFixed(6)
        : null;

    // Transform arrays for each floating background blob
    const blob1Transform = [
        { translateX: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) },
        { translateY: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
        { scale: floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }
    ];

    const blob2Transform = [
        { translateX: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
        { translateY: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
        { scale: floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }
    ];

    const blob3Transform = [
        { translateX: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
        { translateY: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
        { scale: floatAnim3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }
    ];

    const blob4Transform = [
        { translateX: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) },
        { translateY: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
        { scale: floatAnim4.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }
    ];

    return (
        <View style={styles.root}>
            <StatusBar
                style={isDark ? 'light' : 'dark'}
                translucent={false}
                backgroundColor={isDark ? '#120820' : '#F7F3FF'}
            />

            <LinearGradient
                colors={isDark ? ['#120820', '#1A0A3E', '#0A0410'] : ['#F7F3FF', '#EBE3FE', '#F7F3FF']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* Animated blob layer with BlurView overlay for the hazy background effect */}
            <View style={StyleSheet.absoluteFill}>
                <Animated.View
                    style={[
                        styles.blobTopLeft,
                        { transform: blob1Transform },
                        { backgroundColor: isDark ? '#6B21A8' : '#C084FC' }
                    ]}
                />
                <Animated.View
                    style={[
                        styles.blobBottomRight,
                        { transform: blob2Transform },
                        { backgroundColor: isDark ? '#3B0764' : '#A855F7' }
                    ]}
                />
                <Animated.View
                    style={[
                        styles.blobMiddleLeft,
                        { transform: blob3Transform },
                        { backgroundColor: isDark ? '#4A148C' : '#CE93D8' }
                    ]}
                />
                <Animated.View
                    style={[
                        styles.blobMiddleRight,
                        { transform: blob4Transform },
                        { backgroundColor: isDark ? '#311B92' : '#B39DDB' }
                    ]}
                />

                <BlurView
                    style={StyleSheet.absoluteFill}
                    blurType={isDark ? 'dark' : 'light'}
                    blurAmount={90}
                    reducedTransparencyFallbackColor={isDark ? '#120820' : '#F7F3FF'}
                />
            </View>

            {/* Mainnet-only toast — shown when user tries to confirm a swap on devnet */}
            <Web3Toast
                message="Swaps are available on Mainnet only"
                visible={isToastVisible}
                onHide={() => setIsToastVisible(false)}
                isSuccess={false}
            />

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20 }]}
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
                                backgroundColor: colors.chip
                            }
                        ]}
                    >
                        <ArrowLeft
                            size={18}
                            color={colors.text}
                            strokeWidth={1.8}
                        />
                    </TouchableOpacity>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Swap Tokens
                    </Text>

                    <View
                        style={[
                            styles.slippagePill,
                            {
                                borderColor: colors.chipBorder,
                                backgroundColor: colors.chip
                            }
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
                    onAmountChange={handleToAmountChange}
                    onFocus={() => setFocused('to')}
                    onBlur={() => setFocused(null)}
                    onTokenPress={() => setPickerSide('to')}
                />

                <SwapInfoRows
                    fromSymbol={fromToken?.symbol ?? null}
                    toSymbol={toToken?.symbol ?? null}
                    price={displayRate}
                    fees="~0.5%"
                    slippage="0.5%"
                    priceImpact="< 0.01%"
                    colors={colors}
                />

                <View style={styles.swipeWrap}>
                    <SwapSwipeButton
                        onSwipeSuccess={handleSwipe}
                        isLoading={isLoading}
                        isSuccess={isSuccess}
                        isFailed={isFailed}
                        colors={colors}
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
        marginTop: 20,
    },
});