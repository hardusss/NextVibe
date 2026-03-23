import React from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Vibration,
    Platform,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { ChevronDown } from 'lucide-react-native';
import FastImage from 'react-native-fast-image';
import type { TokenAsset } from '@/hooks/usePortfolio';
import type { SwapColors } from '@/src/types/swap';

interface SwapCardProps {
    label: 'PAY' | 'RECEIVE';
    token: TokenAsset | null;
    amount: string;
    isFocused: boolean;
    colors: SwapColors;
    onAmountChange?: (v: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onTokenPress: () => void;
    showPercentButtons?: boolean;
    onPercentPress?: (pct: number) => void;
}

const PERCENT_OPTIONS = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: 'MAX', value: 1 },
];

/**
 * Renders a highly translucent glassmorphic card.
 * Shadows and elevation are intentionally removed to prevent Android from 
 * rendering solid dark clipping boxes behind the translucent background.
 */
export default function SwapCard({
    label,
    token,
    amount,
    isFocused,
    colors,
    onAmountChange,
    onFocus,
    onBlur,
    onTokenPress,
    showPercentButtons = false,
    onPercentPress,
}: SwapCardProps) {
    const usdEquiv = token?.price && Number(amount) > 0
        ? `$${(Number(amount) * token.price).toFixed(2)}`
        : null;

    const balanceStr = token ? `${token.amount.toFixed(4)} ${token.symbol}` : '—';

    return (
        <View 
            style={[
                styles.wrapper,
                isFocused && { 
                    borderColor: colors.accent, 
                },
                !isFocused && { 
                    borderColor: colors.cardBorder 
                },
                { 
                    backgroundColor: isFocused 
                        ? (colors.isDark ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.1)')
                        : (colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.4)') 
                }
            ]}
        >
            {Platform.OS === 'ios' ? (
                <BlurView
                    style={StyleSheet.absoluteFill}
                    blurType={colors.isDark ? 'dark' : 'light'}
                    blurAmount={15}
                    reducedTransparencyFallbackColor="transparent"
                />
            ) : (
                <View 
                    style={[
                        StyleSheet.absoluteFill, 
                        styles.androidBlurFallback, 
                        {
                            backgroundColor: colors.isDark ? 'rgba(18, 8, 30, 0.4)' : 'rgba(245, 240, 255, 0.5)',
                        }
                    ]} 
                />
            )}

            <View 
                style={[
                    StyleSheet.absoluteFill, 
                    styles.glassHighlight, 
                    {
                        borderColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)'
                    }
                ]} 
            />

            <View style={styles.inner}>
                <View style={styles.topRow}>
                    <Text style={[styles.cardLabel, { color: colors.muted }]}>
                        {label}
                    </Text>

                    <TouchableOpacity
                        onPress={() => { 
                            Vibration.vibrate(20); 
                            onTokenPress(); 
                        }}
                        style={[
                            styles.tokenChip, 
                            { 
                                borderColor: colors.chipBorder, 
                                backgroundColor: colors.chip 
                            }
                        ]}
                    >
                        {token?.logoURI ? (
                            <FastImage 
                                source={{ uri: token.logoURI }} 
                                style={styles.tokenLogo} 
                            />
                        ) : (
                            <View 
                                style={[
                                    styles.tokenLogoPlaceholder, 
                                    { backgroundColor: colors.chip }
                                ]} 
                            />
                        )}
                        <Text style={[styles.tokenSymbol, { color: colors.text }]}>
                            {token?.symbol ?? '—'}
                        </Text>
                        <ChevronDown 
                            size={13} 
                            color={colors.accent} 
                            strokeWidth={2} 
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.midRow}>
                    <TextInput
                        style={[styles.amountInput, { color: colors.text }]}
                        value={amount}
                        onChangeText={onAmountChange}
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                        keyboardType="decimal-pad"
                        onFocus={onFocus}
                        onBlur={onBlur}
                        numberOfLines={1}
                        editable={!!onAmountChange}
                    />
                    <Text style={[styles.balance, { color: colors.muted }]}>
                        {balanceStr}
                    </Text>
                </View>

                <View style={styles.bottomRow}>
                    <Text style={[styles.usd, { color: colors.muted }]}>
                        {usdEquiv ?? '$0.00'}
                    </Text>

                    {showPercentButtons && onPercentPress && (
                        <View style={styles.percentRow}>
                            {PERCENT_OPTIONS.map(({ label: pl, value }) => (
                                <TouchableOpacity
                                    key={pl}
                                    onPress={() => { 
                                        Vibration.vibrate(18); 
                                        onPercentPress(value); 
                                    }}
                                    style={[
                                        styles.pctBtn, 
                                        { 
                                            borderColor: colors.chipBorder, 
                                            backgroundColor: colors.chip 
                                        }
                                    ]}
                                >
                                    <Text style={[styles.pctText, { color: colors.accent }]}>
                                        {pl}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        borderRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
    },
    glassHighlight: {
        borderRadius: 24,
        borderWidth: 1.5,
        borderBottomWidth: 0,
        borderRightWidth: 0,
    },
    androidBlurFallback: {
        borderRadius: 24,
    },
    inner: {
        padding: 18,
        gap: 10,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    tokenChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 14,
        borderWidth: 1,
    },
    tokenLogo: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    tokenLogoPlaceholder: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    tokenSymbol: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    midRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
    },
    amountInput: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 42,
        includeFontPadding: false,
        flex: 1,
        paddingVertical: 0,
    },
    balance: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
        textAlign: 'right',
        flexShrink: 1,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    usd: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
    percentRow: {
        flexDirection: 'row',
        gap: 6,
    },
    pctBtn: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    pctText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 10,
        includeFontPadding: false,
    },
});