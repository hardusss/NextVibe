import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { SwapColors } from '@/src/types/swap';

interface SwapInfoRowsProps {
    fromSymbol: string | null;
    toSymbol: string | null;
    price: string | null;
    fees: string;
    slippage: string;
    priceImpact: string;
    colors: SwapColors;
}

interface InfoRowProps {
    label: string;
    value: string;
    colors: SwapColors;
    withIcon?: boolean;
}

/**
 * Renders a single key-value row for transaction metadata.
 */
function InfoRow({ label, value, colors, withIcon = false }: InfoRowProps) {
    return (
        <View style={styles.row}>
            <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
            <View style={styles.valueWrap}>
                <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
                {withIcon && (
                    <ExternalLink size={12} color={colors.muted} strokeWidth={1.5} />
                )}
            </View>
        </View>
    );
}

/**
 * Displays supplementary transaction details (routing provider, slippage, fees).
 * Uses a semi-transparent border to complement the main glassmorphic layout.
 */
export default function SwapInfoRows({
    fromSymbol,
    toSymbol,
    price,
    fees,
    slippage,
    priceImpact,
    colors,
}: SwapInfoRowsProps) {
    const priceLabel = fromSymbol && toSymbol
        ? `1 ${fromSymbol} ≈ ${price ?? '—'} ${toSymbol}`
        : '—';

    return (
        <View style={[
            styles.container, 
            { 
                borderColor: colors.cardBorder,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.3)'
            }
        ]}>
            <InfoRow label="Provider" value="Jupiter V6" colors={colors} withIcon />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Price" value={priceLabel} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Fees" value={fees} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Slippage" value={slippage} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Price Impact" value={priceImpact} colors={colors} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 20,
        borderWidth: 1,
        marginTop: 12,
        paddingVertical: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 11,
    },
    label: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
    },
    valueWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    value: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        textAlign: 'right',
        flexShrink: 1,
        maxWidth: 200,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 16,
    },
});