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

    const bg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
    const mainColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
    const iconColor = isDark ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";
    const switchBg = isDark ? "rgba(196,167,255,0.1)" : "rgba(109,40,217,0.07)";
    const switchBorder = isDark ? "rgba(196,167,255,0.25)" : "rgba(109,40,217,0.2)";

    return (
        <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
            <View style={styles.left}>
                {tokenIcon ? (
                    <FastImage source={{ uri: tokenIcon }} style={styles.logo} resizeMode={FastImage.resizeMode.cover} />
                ) : (
                    <View style={[styles.logo, { backgroundColor: border, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: mainColor, fontFamily: 'Dank Mono Bold', fontSize: 12 }}>{tokenSymbol[0]}</Text>
                    </View>
                )}
                <View style={styles.nameWrap}>
                    <Text style={[styles.name, { color: mainColor }]}>{tokenName}</Text>
                    <TouchableOpacity
                        onPress={() => router.push("/select-token")}
                        style={[styles.switchBtn, { backgroundColor: switchBg, borderColor: switchBorder }]}
                    >
                        <ArrowLeftRight size={11} color={iconColor} strokeWidth={1.8} />
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
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderWidth: 1,
        marginBottom: 12,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    logo: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    nameWrap: {
        gap: 6,
    },
    name: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    switchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    switchText: {
        fontFamily: 'Dank Mono',
        fontSize: 10,
        includeFontPadding: false,
    },
    right: {
        alignItems: 'flex-end',
    },
    usd: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 15,
        includeFontPadding: false,
    },
    amount: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
        marginTop: 3,
    },
});