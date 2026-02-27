import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShieldCheck } from "lucide-react-native";

export default function LazorKitShield({ isDark }: { isDark: boolean }) {
    const bg = isDark ? "rgba(52,211,153,0.07)" : "rgba(5,150,105,0.05)";
    const border = isDark ? "rgba(52,211,153,0.2)" : "rgba(5,150,105,0.15)";
    const iconColor = isDark ? "rgba(52,211,153,0.9)" : "rgba(5,150,105,0.85)";
    const titleColor = isDark ? "rgba(52,211,153,0.88)" : "rgba(5,150,105,0.82)";
    const mutedColor = isDark ? "rgba(52,211,153,0.5)" : "rgba(5,150,105,0.5)";
    const badgeBg = isDark ? "rgba(52,211,153,0.12)" : "rgba(5,150,105,0.08)";

    return (
        <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }]}>
            <ShieldCheck size={20} color={iconColor} strokeWidth={1.5} />
            <View style={styles.textWrap}>
                <Text style={[styles.title, { color: titleColor }]}>LazorKit Protected</Text>
                <Text style={[styles.sub, { color: mutedColor }]}>Gasless via Face ID</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: border }]}>
                <Text style={[styles.badgeText, { color: iconColor }]}>FREE</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderWidth: 1,
        marginTop: 8,
    },
    textWrap: { flex: 1 },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 13,
        includeFontPadding: false,
    },
    sub: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
        marginTop: 2,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
    },
    badgeText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 10,
        includeFontPadding: false,
        letterSpacing: 1,
    },
});