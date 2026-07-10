import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { ShimmerSkeleton } from "@/components/Shared/motion";
import { AlertCircle, FileText, ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from "lucide-react-native";
import { GlassSurface } from "@/components/Shared/GlassSurface";
import { FormattedTransaction } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";
import timeAgo from "@/src/utils/formatTime";

/**
 * Props for the LastTransaction dashboard widget.
 *
 * @interface LastTransactionProps
 */
interface LastTransactionProps {
    /** Whether the app is currently in dark mode */
    isDarkMode: boolean;
    /** Whether the user has toggled balance visibility off */
    isBalanceHidden: boolean;
    /** Most recent transaction, or null when history is empty */
    transaction: FormattedTransaction | null;
    /** Current USD price of the transaction's primary token */
    tokenPrice: number;
    /** True while the transaction is being fetched */
    isLoading: boolean;
    /** Error message if the fetch failed */
    error: string | null;
    /** Callback when the card is pressed (navigates to history) */
    onPress: () => void;
}

/**
 * Resolves the visual metadata (icon, accent colour, background) for a
 * given transaction type so every variant gets a unique colour treatment.
 *
 * @param type  - Transaction type string
 * @param isDarkMode - Current theme mode
 * @returns Object containing the Lucide Icon component and colour tokens
 */
function getTxMeta(type: string, isDarkMode: boolean) {
    switch (type?.toLowerCase()) {
        case "received":
        case "receive":
            return {
                Icon: ArrowDownLeft,
                accent: isDarkMode ? "rgba(52,211,153,0.85)" : "rgba(5,150,105,0.85)",
                accentBg: isDarkMode ? "rgba(52,211,153,0.1)" : "rgba(5,150,105,0.08)",
            };
        case "sent":
        case "send":
            return {
                Icon: ArrowUpRight,
                accent: isDarkMode ? "rgba(244,114,182,0.85)" : "rgba(219,39,119,0.85)",
                accentBg: isDarkMode ? "rgba(244,114,182,0.1)" : "rgba(219,39,119,0.08)",
            };
        case "swap":
            return {
                Icon: ArrowRightLeft,
                accent: isDarkMode ? "#60A5FA" : "#3B82F6",
                accentBg: isDarkMode ? "rgba(96,165,250,0.15)" : "rgba(59,130,246,0.1)",
            };
        default:
            return {
                Icon: ArrowRightLeft,
                accent: isDarkMode ? "rgba(196,167,255,0.85)" : "rgba(109,40,217,0.85)",
                accentBg: isDarkMode ? "rgba(196,167,255,0.1)" : "rgba(109,40,217,0.08)",
            };
    }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Renders the content of a swap transaction inside the LastTransaction card.
 * Displays a dual-token layout with icons showing the sold and bought tokens,
 * their amounts, and a decorative arrow between them.
 *
 * @param props.isDarkMode       - Current theme mode
 * @param props.isBalanceHidden  - Whether amounts should be masked
 * @param props.transaction      - The swap transaction to render
 */
const SwapContent: React.FC<{
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    transaction: FormattedTransaction;
}> = ({ isDarkMode, isBalanceHidden, transaction }) => {
    const { accent, accentBg } = getTxMeta("swap", isDarkMode);
    const swap = transaction.swapDetails;

    const mutedText = isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";

    if (!swap) return null;

    /**
     * Formats a token amount for display, limiting decimal places
     * based on the magnitude of the number.
     */
    const formatAmount = (amount: number): string => {
        if (amount >= 1000) return amount.toFixed(0);
        if (amount >= 1) return amount.toFixed(2);
        return amount.toFixed(4);
    };

    return (
        <>
            {/* Dual token icons with overlap */}
            <View style={styles.swapAvatarWrap}>
                {swap.inputLogoURL ? (
                    <Image source={{ uri: swap.inputLogoURL }} style={styles.swapTokenLeft} />
                ) : (
                    <View style={[styles.swapTokenLeft, { backgroundColor: isDarkMode ? '#333' : '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 8, fontFamily: "Dank Mono" }}>
                            {swap.inputToken.slice(0, 3)}
                        </Text>
                    </View>
                )}
                {swap.outputLogoURL ? (
                    <Image source={{ uri: swap.outputLogoURL }} style={styles.swapTokenRight} />
                ) : (
                    <View style={[styles.swapTokenRight, { backgroundColor: isDarkMode ? '#333' : '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 8, fontFamily: "Dank Mono" }}>
                            {swap.outputToken.slice(0, 3)}
                        </Text>
                    </View>
                )}
                {/* Swap badge — rendered on top of both coin icons */}
                <View style={[styles.typeBadge, { backgroundColor: "#3B82F6", borderColor: isDarkMode ? "#1a1a2e" : "#ffffff" }]}>
                    <ArrowRightLeft size={10} color="#fff" strokeWidth={2} />
                </View>
            </View>

            {/* Swap details text */}
            <View style={styles.textBlock}>
                {isBalanceHidden ? (
                    <>
                        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                            Token Swap
                        </Text>
                        <Text style={[styles.sub, { color: mutedText }]}>••••</Text>
                    </>
                ) : (
                    <>
                        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                            Swap
                        </Text>
                        <View style={styles.swapAmountsRow}>
                            <Text style={[styles.swapAmountSent, { color: isDarkMode ? "#F472B6" : "#DB2777" }]}>
                                -{formatAmount(swap.inputAmount)} {swap.inputToken}
                            </Text>
                            <Text style={[styles.swapArrow, { color: mutedText }]}>→</Text>
                            <Text style={[styles.swapAmountReceived, { color: isDarkMode ? "#34D399" : "#059669" }]}>
                                +{formatAmount(swap.outputAmount)} {swap.outputToken}
                            </Text>
                        </View>
                    </>
                )}
            </View>

            <Text style={[styles.time, { color: mutedText }]}>
                {transaction.time ? timeAgo(new Date(transaction.time).toISOString()) : ""}
            </Text>
        </>
    );
};

/**
 * Renders the content of a regular (non-swap) transaction inside the
 * LastTransaction card — showing token icon, amount, USD value and time.
 *
 * @param props.isDarkMode       - Current theme mode
 * @param props.isBalanceHidden  - Whether amounts should be masked
 * @param props.transaction      - The transaction data to display
 * @param props.tokenPrice       - Current USD price of the token
 */
const TransactionContent: React.FC<{
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    transaction: FormattedTransaction;
    tokenPrice: number;
}> = ({ isDarkMode, isBalanceHidden, transaction, tokenPrice }) => {
    let tokenInfo = TOKENS[transaction.token as keyof typeof TOKENS];
    if (!tokenInfo) {
        tokenInfo = Object.values(TOKENS).find(t => t.mint === transaction.token) as any;
    }
    const amount = Number(transaction.amount.toFixed(8));
    const usdValue = Number((amount * tokenPrice).toFixed(2));
    const { Icon, accent, accentBg } = getTxMeta(transaction.type, isDarkMode);

    const mutedText = isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const subColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
    
    const displaySymbol = tokenInfo?.symbol || (transaction.token.length > 8 ? `${transaction.token.slice(0, 4)}...` : transaction.token);

    return (
        <>
            {/* Token image + type icon badge */}
            <View style={styles.avatarWrap}>
                {tokenInfo?.logoURL ? (
                    <Image source={{ uri: tokenInfo.logoURL }} style={styles.tokenImage} />
                ) : (
                    <View style={[styles.tokenImage, { backgroundColor: isDarkMode ? '#333' : '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 10, fontFamily: "Dank Mono" }}>
                            {displaySymbol.slice(0, 3)}
                        </Text>
                    </View>
                )}
                <View style={[styles.typeBadge, { backgroundColor: accentBg, borderColor: accent + "40" }]}>
                    <Icon size={10} color={accent} strokeWidth={2} />
                </View>
            </View>

            {/* Text */}
            <View style={styles.textBlock}>
                <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                    {isBalanceHidden ? "Recent transaction" : `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} ${amount} ${displaySymbol}`}
                </Text>
                <Text style={[styles.sub, { color: subColor }]}>
                    {isBalanceHidden ? "••••" : `≈ $${usdValue} USD`}
                </Text>
            </View>

            <Text style={[styles.time, { color: mutedText }]}>
                {transaction.time ? timeAgo(new Date(transaction.time).toISOString()) : ""}
            </Text>
        </>
    );
};

/**
 * Skeleton placeholder shown while the last transaction is loading.
 *
 * @param props.isDarkMode - Current theme mode
 */
const LoadingSkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
    <>
        <ShimmerSkeleton width={40} height={40} borderRadius={20} isDark={isDarkMode} />
        <View style={styles.textBlock}>
            <ShimmerSkeleton width={130} height={14} borderRadius={6} isDark={isDarkMode} />
            <ShimmerSkeleton width={80} height={11} borderRadius={6} isDark={isDarkMode} style={{ marginTop: 8 }} />
        </View>
        <ShimmerSkeleton width={38} height={11} borderRadius={6} isDark={isDarkMode} />
    </>
);

/**
 * Error state shown when the transaction fetch fails.
 *
 * @param props.isDarkMode - Current theme mode
 */
const ErrorState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
    <View style={styles.stateRow}>
        <AlertCircle size={18} color={isDarkMode ? "#F87171" : "#EF4444"} strokeWidth={1.5} />
        <Text style={[styles.stateText, { color: isDarkMode ? "#F87171" : "#EF4444", fontFamily: "Dank Mono" }]}>
            Failed to load activity
        </Text>
    </View>
);

/**
 * Empty state shown when no transactions exist yet.
 *
 * @param props.isDarkMode - Current theme mode
 */
const EmptyState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    const color = isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
    return (
        <View style={styles.stateRow}>
            <FileText size={18} color={color} strokeWidth={1.5} />
            <Text style={[styles.stateText, { color, fontFamily: "Dank Mono" }]}>
                No recent activity
            </Text>
        </View>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * LastTransaction Component
 *
 * Dashboard widget that shows the most recent wallet transaction in a
 * compact card. Supports three content states (loading / error / data)
 * and renders swaps with a special dual-icon layout showing both the
 * sold and received tokens with colour-coded amounts.
 *
 * @param props - {@link LastTransactionProps}
 */
const LastTransaction: React.FC<LastTransactionProps> = ({
    isDarkMode,
    isBalanceHidden,
    transaction,
    tokenPrice,
    isLoading,
    error,
    onPress,
}) => {
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";

    // Accent bar color when we have a real transaction
    const accentBarColor = transaction
        ? getTxMeta(transaction.type, isDarkMode).accent
        : "transparent";

    const isDisabled = isLoading || (!error && !transaction);

    /** Determine whether this transaction should use the swap layout */
    const isSwapTransaction = transaction?.type === "swap" && transaction.swapDetails;

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[
                    styles.card,
                    Platform.OS === 'ios' && { borderWidth: 0 },
                    Platform.OS !== 'ios' && { backgroundColor: bg, borderColor: border }
                ]}
                onPress={onPress}
                disabled={isDisabled}
                activeOpacity={0.65}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                {Platform.OS === 'ios' && (
                    <GlassSurface
                        style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
                        glassEffectStyle="regular"
                        colorScheme={isDarkMode ? "dark" : "light"}
                        isInteractive
                        tintColor={isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)"}
                    />
                )}

                {/* Left accent bar — thin stripe that shows tx direction */}
                <View style={[styles.accentBar, { backgroundColor: accentBarColor }, Platform.OS === 'ios' && { zIndex: 1 }]} />

                <View style={[styles.inner, Platform.OS === 'ios' && { zIndex: 1 }]}>
                    {isLoading && <LoadingSkeleton isDarkMode={isDarkMode} />}
                    {!isLoading && error && <ErrorState isDarkMode={isDarkMode} />}
                    {!isLoading && !error && !transaction && <EmptyState isDarkMode={isDarkMode} />}
                    {!isLoading && !error && transaction && isSwapTransaction && (
                        <SwapContent
                            isDarkMode={isDarkMode}
                            isBalanceHidden={isBalanceHidden}
                            transaction={transaction}
                        />
                    )}
                    {!isLoading && !error && transaction && !isSwapTransaction && (
                        <TransactionContent
                            isDarkMode={isDarkMode}
                            isBalanceHidden={isBalanceHidden}
                            transaction={transaction}
                            tokenPrice={tokenPrice}
                        />
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: "hidden",
        flexDirection: "row",
        minHeight: 76,
    },
    // Thin left bar — signature accent line
    accentBar: {
        width: 3,
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
    },
    inner: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    avatarWrap: {
        width: 44,
        height: 44,
        marginRight: 14,
    },
    tokenImage: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    typeBadge: {
        position: "absolute",
        bottom: -1,
        right: -1,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        zIndex: 3,
    },
    textBlock: {
        flex: 1,
    },
    title: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        includeFontPadding: false,
        marginBottom: 5,
    },
    sub: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
    },
    rightCol: {
        alignItems: "flex-end",
        marginLeft: 8,
    },
    time: {
        fontFamily: "Dank Mono",
        fontSize: 11,
    },
    stateRow: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: 8,
    },
    stateText: {
        fontSize: 14,
    },
    skeletonCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 14,
    },
    skeletonLine: {
        borderRadius: 6,
    },
    // ─── Swap-specific styles ─────────────────────────────────────
    swapAvatarWrap: {
        width: 52,
        height: 44,
        marginRight: 14,
    },
    swapTokenLeft: {
        width: 34,
        height: 34,
        borderRadius: 17,
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 2,
        borderWidth: 2,
        borderColor: "rgba(0,0,0,0.15)",
    },
    swapTokenRight: {
        width: 34,
        height: 34,
        borderRadius: 17,
        position: "absolute",
        top: 8,
        left: 18,
        zIndex: 1,
        borderWidth: 2,
        borderColor: "rgba(0,0,0,0.15)",
    },
    swapAmountsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
    },
    swapAmountSent: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
    },
    swapArrow: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
        marginHorizontal: 2,
    },
    swapAmountReceived: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
    },
});

export default memo(LastTransaction);