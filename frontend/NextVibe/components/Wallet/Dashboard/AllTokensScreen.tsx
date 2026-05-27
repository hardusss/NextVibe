import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ChevronLeft, BriefcaseBusiness } from "lucide-react-native";
import usePortfolio from "@/hooks/usePortfolio";
import TokenItem from "./TokenItem";
import { createWalletStyles } from "@/styles/wallet.styles";

export default function AllTokensScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === "dark";
    
    const { data, isLoading } = usePortfolio();
    
    // UI state management
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);
    const styles = createWalletStyles(isDarkMode);

    const sheetBg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    const border = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)";
    const titleColor = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const mutedColor = isDarkMode ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.28)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.8)" : "rgba(109,40,217,0.75)";

    return (
        <LinearGradient
            colors={
                isDarkMode
                    ? ["#0A0410", "#1a0a2e", "#0A0410"]
                    : ["#FFFFFF", "#dbd4fbff", "#d7cdf2ff"]
            }
            style={styles.container}
        >
            <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} />

            <View style={localStyles.header}>
                <TouchableOpacity onPress={() => router.back()} style={localStyles.backButton}>
                    <ChevronLeft size={24} color={isDarkMode ? "#fff" : "#000"} />
                </TouchableOpacity>
                <Text style={[localStyles.headerTitle, { color: isDarkMode ? "#fff" : "#000" }]}>
                    All Tokens
                </Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={localStyles.scrollContent}>
                <View style={[localStyles.sheet, { backgroundColor: sheetBg, borderColor: border }]}>
                    <View style={localStyles.sheetHeader}>
                        <View style={localStyles.headerLeft}>
                            <BriefcaseBusiness size={15} color={iconColor} strokeWidth={1.5} />
                            <Text style={[localStyles.title, { color: titleColor }]}>Portfolio</Text>
                        </View>
                        {!isLoading && (
                            <Text style={[localStyles.count, { color: mutedColor }]}>
                                {data.tokens.length} token{data.tokens.length !== 1 ? "s" : ""}
                            </Text>
                        )}
                    </View>

                    <View style={localStyles.content}>
                        {data.tokens.map((token, i) => (
                            <TokenItem
                                key={token.symbol}
                                token={token}
                                isDarkMode={isDarkMode}
                                isBalanceHidden={isBalanceHidden}
                                isLast={i === data.tokens.length - 1}
                            />
                        ))}
                    </View>
                </View>
            </ScrollView>
        </LinearGradient>
    );
}

const localStyles = StyleSheet.create({
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 18,
        includeFontPadding: false,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    sheet: {
        borderRadius: 28,
        borderWidth: 1,
        overflow: "hidden",
    },
    sheetHeader: {
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
        paddingBottom: 16,
    },
});
