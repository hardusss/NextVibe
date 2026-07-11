import React, { useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    Platform,
    ScrollView,
    RefreshControl,
} from "react-native";
import { GlassSurface } from "@/components/Shared/GlassSurface";
import { Wallet, BriefcaseBusiness, ArrowRight, Sparkles } from "lucide-react-native";
import { TokenAsset } from "@/hooks/usePortfolio.types";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TokenItem from "./TokenItem";


interface PortfolioListProps {
    isDarkMode: boolean;
    isBalanceHidden: boolean;
    tokens: TokenAsset[];
    isLoading: boolean;
    onRefresh?: () => void;
    refreshing?: boolean;
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

function PortfolioList({
    isDarkMode,
    isBalanceHidden,
    tokens,
    isLoading,
    onRefresh,
    refreshing,
}: PortfolioListProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();

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

    const nonZeroTokens = React.useMemo(() => {
        return tokens.filter(t => t.amount > 0);
    }, [tokens]);

    const displayTokens = React.useMemo(() => {
        const result = [...nonZeroTokens];
        const defaultSymbols = ["SOL", "SKR", "USDC"];
        
        for (const symbol of defaultSymbols) {
            if (result.length >= 3) break;
            const alreadyAdded = result.some(t => t.symbol === symbol);
            if (!alreadyAdded) {
                const tokenObj = tokens.find(t => t.symbol === symbol);
                if (tokenObj) {
                    result.push(tokenObj);
                }
            }
        }
        return result.slice(0, 3);
    }, [tokens, nonZeroTokens]);

    const count = !isLoading ? nonZeroTokens.length : null;

    return (
        <GlassSurface
            style={[
                styles.sheet,
                Platform.OS === 'ios' && { borderWidth: 0 },
                Platform.OS !== 'ios' && { backgroundColor: sheetBg, borderColor: border },
                { paddingBottom: 16 },
                { flex: 1 }
            ]}
            glassEffectStyle="clear"
            colorScheme={isDarkMode ? "dark" : "light"}
            tintColor={isDarkMode ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.005)"}
        >
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
                ) : displayTokens.length === 0 ? (
                    <EmptyState isDarkMode={isDarkMode} />
                ) : (
                    <View style={{ flex: 1, justifyContent: "space-between" }}>
                        <ScrollView
                            style={styles.tokenList}
                            contentContainerStyle={{ flexGrow: 1 }}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                onRefresh ? (
                                    <RefreshControl
                                        refreshing={refreshing || false}
                                        onRefresh={onRefresh}
                                        tintColor={isDarkMode ? "#fff" : "#000"}
                                    />
                                ) : undefined
                            }
                        >
                            {displayTokens.map((token, i) => (
                                <TokenItem
                                    key={token.symbol}
                                    token={token}
                                    isDarkMode={isDarkMode}
                                    isBalanceHidden={isBalanceHidden}
                                    isLast={i === displayTokens.length - 1}
                                    index={i}
                                />
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={[
                                styles.viewAllButton,
                                {
                                    backgroundColor: isDarkMode ? "#8B5CF6" : "#7c3aed",
                                    borderWidth: 0,
                                },
                            ]}
                            activeOpacity={0.8}
                            onPress={() => router.push("/all-tokens")}
                        >
                            <View style={styles.viewAllLeft}>
                                <Sparkles
                                    size={14}
                                    color="#FFFFFF"
                                    strokeWidth={2}
                                />
                                <Text
                                    style={[
                                        styles.viewAllText,
                                        {
                                            color: "#FFFFFF",
                                        },
                                    ]}
                                >
                                    Show all tokens
                                </Text>
                            </View>
                            <ArrowRight
                                size={14}
                                color="#FFFFFF"
                                strokeWidth={2}
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.View>
        </GlassSurface>
    );
}

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
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 24,
        marginHorizontal: 48,
        marginTop: 12,
        marginBottom: 12,
    },
    viewAllLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    viewAllText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        letterSpacing: 0.3,
        includeFontPadding: false,
    },
});

export default React.memo(PortfolioList);