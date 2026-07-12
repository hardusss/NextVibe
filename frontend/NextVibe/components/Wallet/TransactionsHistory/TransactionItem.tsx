import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import FrostedView from '@/components/Shared/FrostedView';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { FormattedTransaction } from '@/src/types/solana';
import { TOKENS } from '@/constants/Tokens';

/**
 * Props for a single transaction row in the history list.
 *
 * @interface TransactionItemProps
 */
type TransactionItemProps = {
    /** The formatted transaction data to render */
    item: FormattedTransaction;
    /** Current token prices keyed by priceKey */
    prices: Record<string, { price: number; change_24h: number; direction: "up" | "down" | "flat" }>;
    /** Whether the app is in dark mode */
    isDark: boolean;
    /** Shared stylesheet from the parent TransactionsHistoryScreen */
    styles: any;
};

/**
 * Resolves a token identifier (symbol or mint address) to its display
 * metadata from the TOKENS constant. Falls back gracefully for unknown tokens.
 *
 * @param token - Token symbol ("SOL", "USDC") or mint address
 * @returns Object with symbol, name, priceKey, and logoURL
 */
const getTokenInfo = (token: string) => {
    if (token === 'SOL') return TOKENS.SOL;
    if (token === 'USDC') return TOKENS.USDC;
    if (token === 'cNFT') return {
        symbol: 'cNFT',
        name: 'Compressed NFT',
        priceKey: 'cnft' as const,
        logoURL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    };

    const found = Object.values(TOKENS).find(t => t.mint === token || t.symbol === token);
    if (found) return found;

    return {
        symbol: token.length > 8 ? token.substring(0, 4) + '...' : token,
        name: 'Unknown Token',
        priceKey: 'unknown' as any,
        logoURL: 'https://via.placeholder.com/44'
    };
};

/**
 * Formats a numeric token amount for compact display.
 * Large values get no decimals, mid-range gets 2, small values get up to 6.
 *
 * @param amount - Raw numeric amount
 * @param isSol  - True for SOL-based tokens (uses 4 decimals by default)
 * @returns Formatted amount string
 */
const formatTokenAmount = (amount: number, isSol: boolean = false): string => {
    if (amount >= 1000) return amount.toFixed(0);
    if (amount >= 1) return amount.toFixed(2);
    if (isSol) return amount.toFixed(4);
    return amount.toFixed(amount < 0.001 ? 6 : 4);
};

// ─── Swap-specific internal styles ──────────────────────────────────────────

const swapStyles = StyleSheet.create({
    /** Container holding two overlapping token icons */
    dualIconContainer: {
        width: 52,
        height: 44,
        position: 'relative',
        marginRight: 16,
    },
    /** Left (input / sold) token icon — sits on top */
    iconLeft: {
        width: 34,
        height: 34,
        borderRadius: 17,
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 2,
    },
    /** Right (output / received) token icon — peeks behind */
    iconRight: {
        width: 34,
        height: 34,
        borderRadius: 17,
        position: 'absolute',
        top: 8,
        left: 18,
        zIndex: 1,
    },
    /** Small circular overlay on the border of the left icon */
    iconBorder: {
        borderWidth: 2,
    },
    /** Row containing the colour-coded swap amounts */
    amountsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 3,
    },
    /** Styled text for the sold (negative) amount */
    sentAmount: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        fontWeight: 'bold',
        includeFontPadding: false,
    },
    /** Decorative arrow between sent and received amounts */
    arrow: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
        marginHorizontal: 2,
    },
    /** Styled text for the received (positive) amount */
    receivedAmount: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        fontWeight: 'bold',
        includeFontPadding: false,
    },
});

/**
 * Renders a single transaction row with glassmorphism effect.
 * Supports three visual layouts:
 * - **Swap** — dual overlapping token icons with colour-coded in/out amounts
 * - **cNFT** — compressed NFT claim / send display
 * - **Default** — standard send/receive with single icon and USD value
 *
 * @param props - {@link TransactionItemProps}
 */
function TransactionItem({ item, prices, isDark, styles }: TransactionItemProps) {
    const router = useRouter();
    const isIncoming = item.type === 'received';
    const isSwap = item.type === 'swap' && !!item.swapDetails;

    const tokenInfo = getTokenInfo(item.token);
    const price = prices[tokenInfo.priceKey]?.price ?? 0;
    const usdValue = (item.amount * price).toFixed(2);

    /**
     * Navigates to the transaction detail screen,
     * passing all relevant params via search params.
     */
    const handlePress = () => {
        router.push({
            pathname: "/transaction-detail",
            params: {
                tx_id: item.signature,
                amount: item.amount,
                direction: item.type,
                icon: tokenInfo.logoURL,
                timestamp: item.time?.getTime() || Date.now(),
                to_address: item.to,
                from_address: item.from,
                blockchain: item.token,
                usdValue: usdValue,
                tx_url: `https://solscan.io/tx/${item.signature}?cluster=mainnet`,
                // Swap-specific params
                ...(isSwap && item.swapDetails ? {
                    swap_input_token: item.swapDetails.inputToken,
                    swap_input_amount: item.swapDetails.inputAmount,
                    swap_input_logo: item.swapDetails.inputLogoURL ?? '',
                    swap_output_token: item.swapDetails.outputToken,
                    swap_output_amount: item.swapDetails.outputAmount,
                    swap_output_logo: item.swapDetails.outputLogoURL ?? '',
                } : {}),
            }
        });
    };

    // ─── Swap layout ────────────────────────────────────────────

    if (isSwap && item.swapDetails) {
        const swap = item.swapDetails;
        const borderColor = isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)';
        const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';

        return (
            <TouchableOpacity
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={styles.transactionItem}
                onPress={handlePress}
                activeOpacity={0.7}
            >
                {Platform.OS === 'android' ? (
                    <View style={[styles.blurViewAbsolute, { backgroundColor: isDark ? 'rgba(15, 2, 28, 0.7)' : 'rgba(255, 255, 255, 0.85)' }]} />
                ) : (
                    <FrostedView
                        intensity={isDark ? 30 : 90}
                        tint={isDark ? 'dark' : 'light'}
                        style={styles.blurViewAbsolute}
                        fallbackBackgroundColor={isDark ? 'rgba(15, 2, 28, 0.7)' : 'rgba(255, 255, 255, 0.85)'}
                    />
                )}
                <View style={styles.transactionItemContent}>
                    {/* Dual overlapping token icons */}
                    <View style={swapStyles.dualIconContainer}>
                        <Image
                            source={{ uri: swap.inputLogoURL || 'https://via.placeholder.com/34' }}
                            style={[swapStyles.iconLeft, swapStyles.iconBorder, { borderColor }]}
                            contentFit="cover"
                        />
                        <Image
                            source={{ uri: swap.outputLogoURL || 'https://via.placeholder.com/34' }}
                            style={[swapStyles.iconRight, swapStyles.iconBorder, { borderColor }]}
                            contentFit="cover"
                        />
                        {/* Direction badge — on top of both coin icons, fully opaque */}
                        <View style={[styles.directionIndicator, {
                            backgroundColor: '#3b82f6',
                            borderColor: isDark ? '#1e1e1e' : '#ffffff',
                            bottom: -2,
                            right: -6,
                            zIndex: 3,
                        }]}>
                            <ArrowLeftRight size={14} color="#fff" />
                        </View>
                    </View>

                    {/* Info section */}
                    <View style={styles.transactionInfo}>
                        <Text style={styles.transactionType}>Swap</Text>
                        <Text style={styles.transactionAddress} numberOfLines={1}>
                            {swap.inputToken} → {swap.outputToken}
                        </Text>
                    </View>

                    {/* Amounts section — colour-coded sent/received */}
                    <View style={styles.transactionDetails}>
                        <View style={swapStyles.amountsRow}>
                            <Text style={[swapStyles.sentAmount, {
                                color: isDark ? '#F472B6' : '#DB2777',
                            }]}>
                                -{formatTokenAmount(swap.inputAmount, swap.inputToken === 'SOL')} {swap.inputToken}
                            </Text>
                        </View>
                        <View style={[swapStyles.amountsRow, { marginTop: 2 }]}>
                            <Text style={[swapStyles.receivedAmount, {
                                color: isDark ? '#34D399' : '#059669',
                            }]}>
                                +{formatTokenAmount(swap.outputAmount, swap.outputToken === 'SOL')} {swap.outputToken}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    // ─── Default (send / receive / cNFT) layout ─────────────────

    return (
        <TouchableOpacity 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            style={styles.transactionItem}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            {Platform.OS === 'android' ? (
                <View style={[styles.blurViewAbsolute, { backgroundColor: isDark ? 'rgba(15, 2, 28, 0.7)' : 'rgba(255, 255, 255, 0.85)' }]} />
            ) : (
                <FrostedView
                    intensity={isDark ? 30 : 90}
                    tint={isDark ? 'dark' : 'light'}
                    style={styles.blurViewAbsolute}
                    fallbackBackgroundColor={isDark ? 'rgba(15, 2, 28, 0.7)' : 'rgba(255, 255, 255, 0.85)'}
                />
            )}
            <View style={styles.transactionItemContent}>
                {/* Icon Section */}
                <View style={styles.transactionIconContainer}>
                    <Image 
                        source={{ uri: tokenInfo.logoURL }} 
                        style={styles.tokenIcon} 
                        contentFit="cover"
                    />
                    <View style={[styles.directionIndicator, { 
                        backgroundColor: isIncoming ? '#2ECC71' : '#E74C3C',
                        borderColor: isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                    }]}>
                        {isIncoming ? (
                            <ArrowDownLeft size={14} color="#fff" />
                        ) : (
                            <ArrowUpRight size={14} color="#fff" />
                        )}
                    </View>
                </View>
                
                {/* Info Section */}
                <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                        {item.token === 'cNFT'
                            ? (isIncoming ? 'cNFT Claimed' : 'cNFT Sent')
                            : (isIncoming ? 'Received' : 'Sent')}
                    </Text>
                    <Text style={styles.transactionAddress} numberOfLines={1} ellipsizeMode="middle">
                        {isIncoming ? `From: ${item.from}` : `To: ${item.to}`}
                    </Text>
                </View>
                
                {/* Amount Section */}
                <View style={styles.transactionDetails}>
                    <Text style={[styles.transactionAmount, { 
                        color: isIncoming ? '#2ECC71' : isDark ? '#FF6B6B' : '#E74C3C'
                    }]}>
                        {isIncoming ? '+' : '-'}
                        {item.token === 'cNFT'
                            ? `${item.amount} cNFT`
                            : `${item.amount.toFixed(item.token === 'SOL' ? 4 : 2)} ${tokenInfo.symbol}`}
                    </Text>
                    {item.token !== 'cNFT' && (
                        <Text style={styles.transactionUsdAmount}>
                            $ {usdValue}
                        </Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

// Memoize to prevent re-renders if props don't change
export default memo(TransactionItem);