import React, { useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
} from "react-native";
import { Wallet, BriefcaseBusiness, ArrowRight, Sparkles } from "lucide-react-native";
import { TokenAsset } from "@/hooks/usePortfolio";
import { useRouter } from "expo-router";
import TokenItem from "./TokenItem";


interface PortfolioListProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    tokens: TokenAsset[];
    isLoading: boolean;
}

// ─── Animated Skeleton ────────────────────────────────────────────────────────

const SkeletonItem: React.FC<{ isDarkMode: boolean; isLast?: boolean; delay?: number }> = ({
    isDarkMode,
    isLast,
    delay = 0,
}) => {
    const shimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(shimmer, {
                    toValue: 1,
                    duration: 900,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmer, {
                    toValue: 0,
                    duration: 900,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
    const skBase = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const divider = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

    return (
        <Animated.View
            style={[
                styles.skItem,
                { opacity },
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider },
            ]}
        >
            <View style={[styles.skCircle, { backgroundColor: skBase }]} />
            <View style={styles.skCenter}>
                <View style={[styles.skLine, { width: 72, height: 12, backgroundColor: skBase }]} />
                <View style={[styles.skLine, { width: 48, height: 9, backgroundColor: skBase, marginTop: 7, opacity: 0.6 }]} />
            </View>
            <View style={styles.skRight}>
                <View style={[styles.skLine, { width: 56, height: 12, backgroundColor: skBase }]} />
                <View style={[styles.skLine, { width: 38, height: 9, backgroundColor: skBase, marginTop: 7, opacity: 0.6 }]} />
            </View>
        </Animated.View>
    );
};

// ─── Empty ────────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    const iconBg = isDarkMode ? "rgba(196,167,255,0.07)" : "rgba(109,40,217,0.06)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.45)" : "rgba(109,40,217,0.4)";
    const textColor = isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.28)";
    const subtitleColor = isDarkMode ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)";

    return (
        <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconWrap, { backgroundColor: iconBg }]}>
                <Wallet size={24} color={iconColor} strokeWidth={1.4} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No assets yet</Text>
            <Text style={[styles.emptySubtitle, { color: subtitleColor }]}>
                Your tokens will appear here
            </Text>
        </View>
    );
};

// ─── Badge ────────────────────────────────────────────────────────────────────

const CountBadge: React.FC<{ count: number; isDarkMode: boolean }> = ({ count, isDarkMode }) => {
    const bg = isDarkMode ? "rgba(196,167,255,0.12)" : "rgba(109,40,217,0.08)";
    const color = isDarkMode ? "rgba(196,167,255,0.85)" : "rgba(109,40,217,0.75)";
    return (
        <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color }]}>{count}</Text>
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
    const router = useRouter();

    // Entrance animation
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        if (!isLoading && tokens.length > 0) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 80,
                    friction: 12,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(1);
            slideAnim.setValue(0);
        }
    }, [isLoading]);

    const sheetBg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    const border = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.85)" : "rgba(109,40,217,0.75)";
    const handleColor = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
    const accentLine = isDarkMode ? "rgba(196,167,255,0.25)" : "rgba(109,40,217,0.2)";
    const sectionDivider = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

    const displayTokens = tokens.slice(0, 3);
    const hasMore = tokens.length > 3;
    const count = !isLoading ? tokens.length : null;

    return (
        <View style={[styles.sheet, { backgroundColor: sheetBg, borderColor: border }]}>
            {/* Drag handle */}
            <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: handleColor }]} />
            </View>

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {/* Accent left bar */}
                    <View style={[styles.accentBar, { backgroundColor: accentLine }]} />
                    <View style={[styles.iconWrap, {
                        backgroundColor: isDarkMode ? "rgba(196,167,255,0.1)" : "rgba(109,40,217,0.07)",
                    }]}>
                        <BriefcaseBusiness size={14} color={iconColor} strokeWidth={1.6} />
                    </View>
                    <Text style={[styles.title, { color: titleColor }]}>Portfolio</Text>
                </View>

                {count !== null && <CountBadge count={count} isDarkMode={isDarkMode} />}
            </View>

            {/* Thin separator */}
            <View style={[styles.separator, { backgroundColor: sectionDivider }]} />

            {/* Content */}
            <Animated.View
                style={[
                    styles.content,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
            >
                {isLoading ? (
                    <View style={styles.skeletonWrap}>
                        <SkeletonItem isDarkMode={isDarkMode} delay={0} />
                        <SkeletonItem isDarkMode={isDarkMode} delay={120} />
                        <SkeletonItem isDarkMode={isDarkMode} isLast delay={240} />
                    </View>
                ) : tokens.length === 0 ? (
                    <EmptyState isDarkMode={isDarkMode} />
                ) : (
                    <View style={styles.tokenList}>
                        {displayTokens.map((token, i) => (
                            <TokenItem
                                key={token.symbol}
                                token={token}
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                isLast={i === displayTokens.length - 1 && !hasMore}
                                index={i}
                            />
                        ))}

                        {hasMore && (
                            <TouchableOpacity
                                style={[
                                    styles.viewAllButton,
                                    {
                                        borderColor: sectionDivider,
                                        backgroundColor: isDarkMode
                                            ? "rgba(196,167,255,0.04)"
                                            : "rgba(109,40,217,0.03)",
                                    },
                                ]}
                                activeOpacity={0.65}
                                onPress={() => router.push("/all-tokens")}
                            >
                                <View style={styles.viewAllLeft}>
                                    <Sparkles
                                        size={13}
                                        color={isDarkMode ? "rgba(196,167,255,0.6)" : "rgba(109,40,217,0.55)"}
                                        strokeWidth={1.5}
                                    />
                                    <Text
                                        style={[
                                            styles.viewAllText,
                                            {
                                                color: isDarkMode
                                                    ? "rgba(196,167,255,0.85)"
                                                    : "rgba(109,40,217,0.8)",
                                            },
                                        ]}
                                    >
                                        View all {tokens.length} tokens
                                    </Text>
                                </View>
                                <ArrowRight
                                    size={14}
                                    color={isDarkMode ? "rgba(196,167,255,0.5)" : "rgba(109,40,217,0.45)"}
                                    strokeWidth={1.8}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </Animated.View>
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheet: {
        marginHorizontal: 0,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: 0,
        paddingBottom: 10,
    },

    // Handle
    handleArea: {
        alignItems: "center",
        paddingTop: 10,
        paddingBottom: 2,
    },
    handle: {
        width: 32,
        height: 3,
        borderRadius: 1.5,
    },

    // Header
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    accentBar: {
        width: 2,
        height: 18,
        borderRadius: 1,
    },
    iconWrap: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        letterSpacing: 0.3,
        includeFontPadding: false,
    },

    // Badge
    badge: {
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 20,
    },
    badgeText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },

    // Separator
    separator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 20,
        marginBottom: 2,
    },

    // Content
    content: {
        flex: 1,
    },
    tokenList: {
        paddingHorizontal: 8,
        paddingTop: 2,
    },
    skeletonWrap: {
        paddingHorizontal: 4,
    },

    // Skeleton
    skItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    skCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        marginRight: 10,
    },
    skCenter: { flex: 1 },
    skRight: { alignItems: "flex-end" },
    skLine: { borderRadius: 6 },

    // Empty
    emptyWrap: {
        alignItems: "center",
        paddingVertical: 52,
        gap: 8,
    },
    emptyIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    emptyTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },
    emptySubtitle: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
        letterSpacing: 0.1,
    },

    // View All
    viewAllButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        marginTop: 0,
    },
    viewAllLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
    viewAllText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },
});

export default PortfolioList;