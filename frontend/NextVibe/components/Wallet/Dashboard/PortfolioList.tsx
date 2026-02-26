import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Wallet, BriefcaseBusiness } from "lucide-react-native";
import { TokenAsset } from "@/hooks/usePortfolio";
import TokenItem from "./TokenItem";

const SCREEN_H = Dimensions.get("window").height;
// Approximate height of content above PortfolioList
const ABOVE_H = 480;

interface PortfolioListProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    tokens: TokenAsset[];
    isLoading: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonItem: React.FC<{ isDarkMode: boolean; isLast?: boolean }> = ({ isDarkMode, isLast }) => {
    const sk = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
    const divider = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";

    return (
        <View style={[
            styles.skItem,
            !isLast && { borderBottomWidth: 1, borderBottomColor: divider },
        ]}>
            <View style={[styles.skCircle, { backgroundColor: sk }]} />
            <View style={styles.skCenter}>
                <View style={[styles.skLine, { width: 80, height: 13, backgroundColor: sk }]} />
                <View style={[styles.skLine, { width: 55, height: 10, backgroundColor: sk, marginTop: 6 }]} />
            </View>
            <View style={styles.skRight}>
                <View style={[styles.skLine, { width: 58, height: 13, backgroundColor: sk }]} />
                <View style={[styles.skLine, { width: 40, height: 10, backgroundColor: sk, marginTop: 6 }]} />
            </View>
        </View>
    );
};

// ─── Empty ────────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    const color = isDarkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)";
    return (
        <View style={styles.emptyWrap}>
            <Wallet size={32} color={color} strokeWidth={1.2} />
            <Text style={[styles.emptyText, { color }]}>No assets found</Text>
        </View>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const PortfolioList: React.FC<PortfolioListProps> = ({
    isDarkMode,
    isBalanceHidden,
    tokens,
    isLoading,
}) => {
    const sheetBg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    const border = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const mutedColor = isDarkMode ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.28)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.8)" : "rgba(109,40,217,0.75)";
    const handleColor = isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";

    const count = !isLoading ? tokens.length : null;

    return (
        <View style={[styles.sheet, { backgroundColor: sheetBg, borderColor: border }]}>
            {/* Drag handle */}
            <View style={[styles.handle, { backgroundColor: handleColor }]} />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <BriefcaseBusiness size={15} color={iconColor} strokeWidth={1.5} />
                    <Text style={[styles.title, { color: titleColor }]}>Portfolio</Text>
                </View>
                {count !== null && (
                    <Text style={[styles.count, { color: mutedColor }]}>
                        {count} token{count !== 1 ? "s" : ""}
                    </Text>
                )}
            </View>

            {/* Content */}
            <View style={styles.content}>
                {isLoading ? (
                    <>
                        <SkeletonItem isDarkMode={isDarkMode} />
                        <SkeletonItem isDarkMode={isDarkMode} />
                        <SkeletonItem isDarkMode={isDarkMode} isLast />
                    </>
                ) : tokens.length === 0 ? (
                    <EmptyState isDarkMode={isDarkMode} />
                ) : (
                    tokens.map((token, i) => (
                        <TokenItem
                            key={token.symbol}
                            token={token}
                            isDarkMode={isDarkMode}
                            isBalanceHidden={isBalanceHidden}
                            isLast={i === tokens.length - 1}
                        />
                    ))
                )}
            </View>
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheet: {
        marginHorizontal: 0,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 1,
        borderBottomWidth: 0,
        minHeight: SCREEN_H - ABOVE_H,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        alignSelf: "center",
        marginTop: 12,
        marginBottom: 4,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
    },
    count: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
    },
    content: {
        paddingHorizontal: 4,
    },

    // Skeleton
    skItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    skCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        marginRight: 12,
    },
    skCenter: { flex: 1 },
    skRight: { alignItems: "flex-end" },
    skLine: { borderRadius: 5 },

    // Empty
    emptyWrap: {
        alignItems: "center",
        paddingVertical: 40,
        gap: 10,
    },
    emptyText: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        includeFontPadding: false,
    },
});

export default PortfolioList;