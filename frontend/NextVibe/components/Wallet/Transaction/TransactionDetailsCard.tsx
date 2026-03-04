import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import FastImage from "react-native-fast-image";
import { ExternalLink } from "lucide-react-native";

interface TransactionDetailsCardProps {
    amount: string;
    symbol: string;
    icon?: string;
    usdValue: string;
    from: string;
    to: string;
    txUrl: string;
    isDark: boolean;
}

const Row = ({ label, value, isDark }: { label: string; value: string; isDark: boolean }) => {
    const mainColor = isDark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.78)";
    const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
    const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";

    return (
        <View style={[styles.row, { borderBottomColor: divider }]}>
            <Text style={[styles.rowLabel, { color: mutedColor }]}>{label}</Text>
            <Text style={[styles.rowValue, { color: mainColor }]} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
        </View>
    );
};

export const TransactionDetailsCard: React.FC<TransactionDetailsCardProps> = ({
    amount, symbol, icon, usdValue, from, to, txUrl, isDark,
}) => {
    const bg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
    const mainColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
    const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
    const accentColor = isDark ? "rgba(196,167,255,0.9)" : "rgba(109,40,217,0.85)";

    const openTx = async () => {
        if (!txUrl) return;
        try {
            if (await Linking.canOpenURL(txUrl)) Linking.openURL(txUrl);
        } catch { }
    };

    return (
        <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
            {/* Amount + icon */}
            <View style={styles.amountRow}>
                {icon ? (
                    <FastImage source={{ uri: icon }} style={styles.logo} resizeMode={FastImage.resizeMode.cover} />
                ) : (
                    <View style={[styles.logo, { backgroundColor: border, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: mainColor, fontFamily: 'Dank Mono Bold', fontSize: 13 }}>{symbol[0]}</Text>
                    </View>
                )}
                <Text style={[styles.amount, { color: mainColor }]}>{amount} {symbol}</Text>
            </View>

            {/* USD */}
            <Text style={[styles.usd, { color: mutedColor }]}>≈ ${usdValue} USD</Text>

            <View style={[styles.dividerLine, { backgroundColor: border }]} />

            {/* Rows */}
            <Row label="From" value={from} isDark={isDark} />
            <Row label="To" value={to} isDark={isDark} />

            {/* Explorer link */}
            <TouchableOpacity onPress={openTx} style={styles.explorerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.explorerText, { color: accentColor }]}>View on Explorer</Text>
                <ExternalLink size={14} color={accentColor} strokeWidth={1.8} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        borderWidth: 1,
        paddingVertical: 20,
        paddingHorizontal: 20,
        width: '100%',
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 6,
    },
    logo: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    amount: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 28,
        includeFontPadding: false,
        letterSpacing: -1,
    },
    usd: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        textAlign: 'center',
        marginBottom: 16,
    },
    dividerLine: {
        height: 1,
        borderRadius: 1,
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 13,
        borderBottomWidth: 1,
        gap: 12,
    },
    rowLabel: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
        width: 40,
    },
    rowValue: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
        flex: 1,
        textAlign: 'right',
    },
    explorerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingTop: 16,
    },
    explorerText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
});