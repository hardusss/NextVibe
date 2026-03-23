import React from 'react';
import { BlurView } from '@react-native-community/blur';
import {
    Modal, View, Text, TouchableOpacity,
    ScrollView, StyleSheet, Vibration, Platform
} from 'react-native';
import type { TokenAsset } from '@/hooks/usePortfolio';
import type { SwapColors } from '@/src/types/swap';

interface SwapTokenPickerProps {
    visible: boolean;
    tokens: TokenAsset[];
    selectedSymbol: string | null;
    colors: SwapColors;
    onSelect: (token: TokenAsset) => void;
    onClose: () => void;
}

/**
 * Bottom-sheet modal for token selection.
 * Utilizes a translucent glassmorphic design to blend with the underlying floating blobs.
 */
export default function SwapTokenPicker({
    visible,
    tokens,
    selectedSymbol,
    colors,
    onSelect,
    onClose,
}: SwapTokenPickerProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={[
                    styles.sheet,
                    { 
                        borderColor: colors.cardBorder,
                        backgroundColor: colors.isDark ? 'rgba(20, 10, 35, 0.4)' : 'rgba(255, 255, 255, 0.4)'
                    }
                ]}>
                    {Platform.OS === 'ios' ? (
                        <BlurView
                            style={StyleSheet.absoluteFill}
                            blurType={colors.isDark ? 'dark' : 'light'}
                            blurAmount={25}
                            reducedTransparencyFallbackColor={colors.isDark ? '#120820' : '#f5f0ff'}
                        />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.isDark ? 'rgba(18,8,34,0.95)' : 'rgba(245,240,255,0.95)' }]} />
                    )}

                    {/* Simulates directional light reflection on the top edges of the modal sheet */}
                    <View style={[StyleSheet.absoluteFill, styles.glassHighlight, {
                        borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)'
                    }]} />

                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Select Token</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={[styles.closeBtn, { color: colors.accent }]}>Close</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        {tokens.map((t) => {
                            const isSelected = t.symbol === selectedSymbol;
                            return (
                                <TouchableOpacity
                                    key={t.symbol}
                                    onPress={() => {
                                        Vibration.vibrate(30);
                                        onSelect(t);
                                    }}
                                    style={[
                                        styles.row,
                                        isSelected && {
                                            backgroundColor: colors.chip,
                                            borderColor: colors.chipBorder,
                                            borderWidth: 1,
                                        },
                                    ]}
                                >
                                    <View style={styles.rowLeft}>
                                        <Text style={[styles.symbol, { color: colors.text }]}>{t.symbol}</Text>
                                        <Text style={[styles.name, { color: colors.muted }]}>{t.name}</Text>
                                    </View>
                                    <View style={styles.rowRight}>
                                        <Text style={[styles.balance, { color: colors.text }]}>
                                            {t.amount.toFixed(4)}
                                        </Text>
                                        <Text style={[styles.usd, { color: colors.muted }]}>
                                            ${t.valueUsd.toFixed(2)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    backdrop: {
        flex: 1,
    },
    sheet: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: 1,
        borderBottomWidth: 0,
        paddingTop: 12,
        maxHeight: '65%',
        overflow: 'hidden',
    },
    glassHighlight: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: 1.5,
        borderBottomWidth: 0,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(168,85,247,0.3)',
        alignSelf: 'center',
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 24,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        includeFontPadding: false,
    },
    closeBtn: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
        includeFontPadding: false,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 4,
    },
    rowLeft: { gap: 3 },
    rowRight: { alignItems: 'flex-end', gap: 3 },
    symbol: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 16,
        includeFontPadding: false,
    },
    name: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
    balance: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        includeFontPadding: false,
    },
    usd: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
});