import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import FastImage from "react-native-fast-image";
import { ArrowLeftRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import formatValue from "@/src/utils/solana/formatValue";

interface TokenInfoCardProps {
    tokenName: string;
    tokenSymbol: string;
    tokenIcon: string;
    usdValue: number;
    balance: number;
    isDark: boolean;
}

export default function TokenInfoCard({
    tokenName, tokenSymbol, tokenIcon, usdValue, balance, isDark,
}: TokenInfoCardProps) {
    const router = useRouter();

    const bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)";
    const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.15)";
    const mainColor = isDark ? "#FFFFFF" : "#111827";
    const mutedColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    const iconColor = isDark ? "#C4A7FF" : "#6D28D9";
    const switchBg = isDark ? "rgba(196,167,255,0.15)" : "rgba(109,40,217,0.1)";
    const switchBorder = isDark ? "rgba(196,167,255,0.3)" : "rgba(109,40,217,0.2)";

    return (
        <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
            <View style={styles.left}>
                {tokenIcon ? (
                    <FastImage source={{ uri: tokenIcon }} style={styles.logo} resizeMode={FastImage.resizeMode.cover} />
                ) : (
                    <View style={[styles.logo, { backgroundColor: border, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: mainColor, fontFamily: 'Dank Mono', fontSize: 16 }}>{tokenSymbol[0]}</Text>
                    </View>
                )}
                <View style={styles.nameWrap}>
                    <Text style={[styles.name, { color: mainColor }]}>{tokenName}</Text>
                    <TouchableOpacity
                        onPress={() => router.push("/select-token")}
                        style={[styles.switchBtn, { backgroundColor: switchBg, borderColor: switchBorder }]}
                    >
                        <ArrowLeftRight size={12} color={iconColor} strokeWidth={1.5} />
                        <Text style={[styles.switchText, { color: iconColor }]}>Switch</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.right}>
                <Text style={[styles.usd, { color: mainColor }]}>${formatValue(usdValue, 2)}</Text>
                <Text style={[styles.amount, { color: mutedColor }]}>{formatValue(balance, 5)} {tokenSymbol}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 12,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        flex: 1,
    },
    logo: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    nameWrap: {
        gap: 6,
    },
    name: {
        fontFamily: 'Dank Mono',
        fontSize: 16,
        includeFontPadding: false,
    },
    switchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    switchText: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
    },
    right: {
        alignItems: 'flex-end',
        gap: 6,
    },
    usd: {
        fontFamily: 'Dank Mono',
        fontSize: 16,
        includeFontPadding: false,
    },
    amount: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
});