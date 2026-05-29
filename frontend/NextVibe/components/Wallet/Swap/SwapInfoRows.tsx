import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { SwapColors } from '@/src/types/swap';

import type { JupiterQuoteResponse } from '@/src/types/jupiter';

interface SwapInfoRowsProps {
    fromSymbol: string | null;
    toSymbol: string | null;
    quote: JupiterQuoteResponse | null;
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
    quote,
    colors,
}: SwapInfoRowsProps) {
    if (!quote) return null;

    // Build the route string (e.g., "Raydium CLMM > Meteora")
    const routeNames = quote.routePlan.map(step => step.swapInfo.label);
    const uniqueRouteNames = Array.from(new Set(routeNames));
    const providerStr = uniqueRouteNames.length > 0 ? uniqueRouteNames.join(' > ') : 'Jupiter V6';

    const inDecimals = 1000000000; // Assuming SOL/USDC defaults for display simplicity, this could be improved
    
    // We get a simple price display out of the raw amounts if possible, but the UI might just show impact and fees
    const slippageStr = `${(quote.slippageBps / 100).toFixed(1)}%`;
    
    const impactNum = Number(quote.priceImpactPct);
    const impactStr = isNaN(impactNum) 
        ? '0.00%' 
        : (impactNum < 0.01 && impactNum > 0) 
            ? '<0.01%' 
            : `${impactNum.toFixed(2)}%`;
    const feeStr = quote.platformFee ? `${(Number(quote.platformFee.amount) / inDecimals).toFixed(6)}` : '0';

    return (
        <View style={[
            styles.container, 
            { 
                borderColor: colors.cardBorder,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.3)'
            }
        ]}>
            <InfoRow label="Provider" value={providerStr} colors={colors} withIcon />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Slippage" value={slippageStr} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Fees" value={feeStr} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.chipBorder }]} />
            <InfoRow label="Price Impact" value={impactStr} colors={colors} />
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