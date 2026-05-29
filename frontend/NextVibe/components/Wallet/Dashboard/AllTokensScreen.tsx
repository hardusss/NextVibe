import React, { useState, useRef, useEffect, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    useColorScheme,
    StatusBar,
    Animated,
    TextInput,
    Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    BriefcaseBusiness,
    Search,
    X,
    TrendingUp,
    TrendingDown,
    ArrowUpDown,
    Eye,
    EyeOff,
    Coins,
} from "lucide-react-native";
import usePortfolio from "@/hooks/usePortfolio";
import TokenItem from "./TokenItem";
import { createWalletStyles } from "@/styles/wallet.styles";

const { width: SCREEN_W } = Dimensions.get("window");

type SortMode = "value" | "change" | "name";

export default function AllTokensScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === "dark";

    const { data, isLoading } = usePortfolio();
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortMode, setSortMode] = useState<SortMode>("value");
    const styles = createWalletStyles(isDarkMode);

    // Entrance animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const headerFade = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-20)).current;
    const summaryScale = useRef(new Animated.Value(0.9)).current;
    const summaryFade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.stagger(120, [
            Animated.parallel([
                Animated.timing(headerFade, {
                    toValue: 1,
                    duration: 350,
                    useNativeDriver: true,
                }),
                Animated.spring(headerSlide, {
                    toValue: 0,
                    tension: 80,
                    friction: 12,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(summaryFade, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(summaryScale, {
                    toValue: 1,
                    tension: 65,
                    friction: 10,
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 380,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 80,
                    friction: 12,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    // Colors
    const titleColor = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)";
    const subtitleColor = isDarkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    const backBg = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
    const backColor = isDarkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
    const accentColor = isDarkMode ? "rgba(167,139,250,0.9)" : "rgba(88,86,214,0.85)";
    const accentBg = isDarkMode ? "rgba(167,139,250,0.1)" : "rgba(88,86,214,0.08)";
    const searchBg = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    const searchBorder = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const searchText = isDarkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";
    const searchPlaceholder = isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
    const chipBg = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    const chipActiveBg = isDarkMode ? "rgba(167,139,250,0.15)" : "rgba(88,86,214,0.1)";
    const chipColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";
    const chipActiveColor = isDarkMode ? "rgba(167,139,250,0.9)" : "rgba(88,86,214,0.85)";
    const summaryCardBg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.65)";
    const summaryCardBorder = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
    const divider = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";

    // Compute stats
    const totalValue = useMemo(() =>
        data.tokens.reduce((sum, t) => sum + t.valueUsd, 0), [data.tokens]);

    const gainersCount = useMemo(() =>
        data.tokens.filter(t => t.direction === "up").length, [data.tokens]);

    const losersCount = useMemo(() =>
        data.tokens.filter(t => t.direction === "down").length, [data.tokens]);

    // Filter and sort
    const filteredTokens = useMemo(() => {
        let tokens = [...data.tokens];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            tokens = tokens.filter(
                t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q)
            );
        }

        switch (sortMode) {
            case "value":
                tokens.sort((a, b) => b.valueUsd - a.valueUsd);
                break;
            case "change":
                tokens.sort((a, b) => b.change24h - a.change24h);
                break;
            case "name":
                tokens.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }

        return tokens;
    }, [data.tokens, searchQuery, sortMode]);

    const tokenCount = !isLoading ? data.tokens.length : null;

    const cycleSortMode = () => {
        setSortMode(prev =>
            prev === "value" ? "change" : prev === "change" ? "name" : "value"
        );
    };

    const sortLabel = sortMode === "value" ? "Value" : sortMode === "change" ? "24h %" : "Name";

    return (
        <LinearGradient
            colors={
                isDarkMode
                    ? ["#0A0410", "#1a0a2e", "#0d0618", "#0A0410"]
                    : ["#FFFFFF", "#ede9fe", "#dbd4fb", "#d7cdf2"]
            }
            locations={[0, 0.3, 0.65, 1]}
            style={styles.container}
        >
            <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} />

            {/* ── Top Navigation ── */}
            <View style={localStyles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[localStyles.backButton, { backgroundColor: backBg }]}
                    activeOpacity={0.65}
                >
                    <ArrowLeft size={18} color={backColor} strokeWidth={1.8} />
                </TouchableOpacity>

                <Animated.View style={{
                    opacity: headerFade,
                    transform: [{ translateY: headerSlide }],
                }}>
                    <Text style={[localStyles.headerTitle, { color: titleColor }]}>
                        Portfolio
                    </Text>
                </Animated.View>

                <TouchableOpacity
                    onPress={() => setIsBalanceHidden(v => !v)}
                    style={[localStyles.backButton, { backgroundColor: backBg }]}
                    activeOpacity={0.65}
                >
                    {isBalanceHidden
                        ? <EyeOff size={16} color={backColor} strokeWidth={1.8} />
                        : <Eye size={16} color={backColor} strokeWidth={1.8} />
                    }
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={localStyles.scrollContent}
            >
                {/* ── Summary Card ── */}
                <Animated.View style={[
                    localStyles.summaryCard,
                    { backgroundColor: summaryCardBg, borderColor: summaryCardBorder },
                    {
                        opacity: summaryFade,
                        transform: [{ scale: summaryScale }],
                    },
                ]}>
                    <View style={localStyles.summaryTop}>
                        <View style={[localStyles.summaryIconWrap, { backgroundColor: accentBg }]}>
                            <BriefcaseBusiness size={18} color={accentColor} strokeWidth={1.5} />
                        </View>
                        <View style={localStyles.summaryTitleArea}>
                            <Text style={[localStyles.summaryLabel, { color: subtitleColor }]}>
                                Total Value
                            </Text>
                            <Text style={[localStyles.summaryValue, { color: titleColor }]}>
                                {isBalanceHidden ? "••••••" : `$${totalValue.toFixed(2)}`}
                            </Text>
                        </View>
                    </View>

                    {/* Stats row */}
                    <View style={[localStyles.statsRow, { borderTopColor: divider }]}>
                        <View style={localStyles.statItem}>
                            <View style={[localStyles.statDot, {
                                backgroundColor: isDarkMode ? "rgba(167,139,250,0.6)" : "rgba(88,86,214,0.5)",
                            }]} />
                            <Text style={[localStyles.statLabel, { color: subtitleColor }]}>Tokens</Text>
                            <Text style={[localStyles.statValue, { color: titleColor }]}>
                                {tokenCount ?? "—"}
                            </Text>
                        </View>

                        <View style={[localStyles.statDivider, { backgroundColor: divider }]} />

                        <View style={localStyles.statItem}>
                            <TrendingUp size={11} color={isDarkMode ? "#6ee7b7" : "#059669"} strokeWidth={2} />
                            <Text style={[localStyles.statLabel, { color: subtitleColor }]}>Gainers</Text>
                            <Text style={[localStyles.statValue, { color: isDarkMode ? "#6ee7b7" : "#059669" }]}>
                                {gainersCount}
                            </Text>
                        </View>

                        <View style={[localStyles.statDivider, { backgroundColor: divider }]} />

                        <View style={localStyles.statItem}>
                            <TrendingDown size={11} color={isDarkMode ? "#fca5a5" : "#dc2626"} strokeWidth={2} />
                            <Text style={[localStyles.statLabel, { color: subtitleColor }]}>Losers</Text>
                            <Text style={[localStyles.statValue, { color: isDarkMode ? "#fca5a5" : "#dc2626" }]}>
                                {losersCount}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* ── Search & Sort Bar ── */}
                <Animated.View style={[
                    localStyles.controlsRow,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}>
                    {/* Search input */}
                    <View style={[localStyles.searchBar, {
                        backgroundColor: searchBg,
                        borderColor: searchBorder,
                    }]}>
                        <Search size={14} color={searchPlaceholder} strokeWidth={1.8} />
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search tokens..."
                            placeholderTextColor={searchPlaceholder}
                            style={[localStyles.searchInput, { color: searchText }]}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.6}>
                                <X size={14} color={searchPlaceholder} strokeWidth={2} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Sort button */}
                    <TouchableOpacity
                        onPress={cycleSortMode}
                        style={[localStyles.sortButton, {
                            backgroundColor: chipActiveBg,
                            borderColor: isDarkMode ? "rgba(167,139,250,0.15)" : "rgba(88,86,214,0.12)",
                        }]}
                        activeOpacity={0.65}
                    >
                        <ArrowUpDown size={12} color={chipActiveColor} strokeWidth={2} />
                        <Text style={[localStyles.sortLabel, { color: chipActiveColor }]}>
                            {sortLabel}
                        </Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* ── Token List ── */}
                <Animated.View
                    style={[
                        localStyles.tokenListContainer,
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* List header */}
                    <View style={localStyles.listHeader}>
                        <View style={localStyles.listHeaderLeft}>
                            <View style={[localStyles.listAccentBar, { backgroundColor: accentColor }]} />
                            <Coins size={13} color={accentColor} strokeWidth={1.6} />
                            <Text style={[localStyles.listTitle, { color: subtitleColor }]}>
                                {searchQuery.trim()
                                    ? `Results (${filteredTokens.length})`
                                    : `All Assets`
                                }
                            </Text>
                        </View>
                    </View>

                    {/* Token items */}
                    {filteredTokens.length > 0 ? (
                        filteredTokens.map((token, i) => (
                            <TokenItem
                                key={token.symbol}
                                token={token}
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                isLast={i === filteredTokens.length - 1}
                                index={i}
                            />
                        ))
                    ) : (
                        <View style={localStyles.emptyState}>
                            <Search size={28} color={subtitleColor} strokeWidth={1.2} />
                            <Text style={[localStyles.emptyTitle, { color: subtitleColor }]}>
                                No tokens found
                            </Text>
                            <Text style={[localStyles.emptySubtitle, { color: chipColor }]}>
                                Try a different search term
                            </Text>
                        </View>
                    )}
                </Animated.View>
            </ScrollView>
        </LinearGradient>
    );
}

const localStyles = StyleSheet.create({
    // ── Navigation header ──
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 12,
    },
    backButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 17,
        letterSpacing: 0.3,
        includeFontPadding: false,
    },

    // ── Scroll ──
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
        paddingTop: 4,
    },

    // ── Summary Card ──
    summaryCard: {
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        marginBottom: 16,
        overflow: "hidden",
    },
    summaryTop: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 16,
        gap: 14,
    },
    summaryIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    summaryTitleArea: {
        flex: 1,
    },
    summaryLabel: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        letterSpacing: 0.3,
        includeFontPadding: false,
        marginBottom: 3,
    },
    summaryValue: {
        fontFamily: "Dank Mono Bold",
        fontSize: 26,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },

    // ── Stats row ──
    statsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    statItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    statDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statLabel: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
    statValue: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    statDivider: {
        width: StyleSheet.hairlineWidth,
        height: 20,
    },

    // ── Controls row ──
    controlsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
    },
    searchBar: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: "Dank Mono",
        fontSize: 13,
        includeFontPadding: false,
        paddingVertical: 0,
    },
    sortButton: {
        flexDirection: "row",
        alignItems: "center",
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 5,
    },
    sortLabel: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },

    // ── Token list ──
    tokenListContainer: {
        paddingBottom: 12,
    },
    listHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    listHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    listAccentBar: {
        width: 2,
        height: 14,
        borderRadius: 1,
    },
    listTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        letterSpacing: 0.5,
        includeFontPadding: false,
        textTransform: "uppercase",
    },

    // ── Empty state ──
    emptyState: {
        alignItems: "center",
        paddingVertical: 50,
        gap: 8,
    },
    emptyTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
        marginTop: 4,
    },
    emptySubtitle: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        includeFontPadding: false,
    },
});