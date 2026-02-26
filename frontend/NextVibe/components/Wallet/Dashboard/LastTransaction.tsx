import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { AlertCircle, FileText, ArrowDownLeft, ArrowUpRight, MoveHorizontal } from "lucide-react-native";
import { FormattedTransaction } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";
import timeAgo from "@/src/utils/formatTime";

interface LastTransactionProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    transaction: FormattedTransaction | null;
    tokenPrice: number;
    isLoading: boolean;
    error: string | null;
    onPress: () => void;
}

/** Pick icon + accent color by transaction type */
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
        default:
            return {
                Icon: MoveHorizontal,
                accent: isDarkMode ? "rgba(196,167,255,0.85)" : "rgba(109,40,217,0.85)",
                accentBg: isDarkMode ? "rgba(196,167,255,0.1)" : "rgba(109,40,217,0.08)",
            };
    }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const TransactionContent: React.FC<{
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    transaction: FormattedTransaction;
    tokenPrice: number;
}> = ({ isDarkMode, isBalanceHidden, transaction, tokenPrice }) => {
    const tokenKey = transaction.token as keyof typeof TOKENS;
    const tokenInfo = TOKENS[tokenKey];
    const amount = Number(transaction.amount.toFixed(8));
    const usdValue = Number((amount * tokenPrice).toFixed(2));
    const { Icon, accent, accentBg } = getTxMeta(transaction.type, isDarkMode);

    const mutedText = isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const subColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

    return (
        <>
            {/* Token image + type icon badge */}
            <View style={styles.avatarWrap}>
                <Image source={{ uri: tokenInfo.logoURL }} style={styles.tokenImage} />
                <View style={[styles.typeBadge, { backgroundColor: accentBg, borderColor: accent + "40" }]}>
                    <Icon size={10} color={accent} strokeWidth={2} />
                </View>
            </View>

            {/* Text */}
            <View style={styles.textBlock}>
                <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                    {isBalanceHidden ? "Recent transaction" : `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} ${amount} ${transaction.token}`}
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

const LoadingSkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    const skBg = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
    return (
        <>
            <View style={[styles.skeletonCircle, { backgroundColor: skBg }]} />
            <View style={styles.textBlock}>
                <View style={[styles.skeletonLine, { width: 130, height: 14, backgroundColor: skBg }]} />
                <View style={[styles.skeletonLine, { width: 80, height: 11, backgroundColor: skBg, marginTop: 8 }]} />
            </View>
            <View style={[styles.skeletonLine, { width: 38, height: 11, backgroundColor: skBg }]} />
        </>
    );
};

const ErrorState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
    <View style={styles.stateRow}>
        <AlertCircle size={18} color={isDarkMode ? "#F87171" : "#EF4444"} strokeWidth={1.5} />
        <Text style={[styles.stateText, { color: isDarkMode ? "#F87171" : "#EF4444", fontFamily: "Dank Mono" }]}>
            Failed to load activity
        </Text>
    </View>
);

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

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.card, { backgroundColor: bg, borderColor: border }]}
                onPress={onPress}
                disabled={isDisabled}
                activeOpacity={0.65}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                {/* Left accent bar — thin stripe that shows tx direction */}
                <View style={[styles.accentBar, { backgroundColor: accentBarColor }]} />

                <View style={styles.inner}>
                    {isLoading && <LoadingSkeleton isDarkMode={isDarkMode} />}
                    {!isLoading && error && <ErrorState isDarkMode={isDarkMode} />}
                    {!isLoading && !error && !transaction && <EmptyState isDarkMode={isDarkMode} />}
                    {!isLoading && !error && transaction && (
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
        borderWidth: 1,
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
});

export default LastTransaction;