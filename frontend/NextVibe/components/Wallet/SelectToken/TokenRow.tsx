import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import FastImage from 'react-native-fast-image';

interface TokenRowProps {
    item: { name: string; symbol: string; icon: string };
    onPress: () => void;
    isDark: boolean;
    index: number;
}

export const TokenRow = ({ item, onPress, isDark, index }: TokenRowProps) => {
    const bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    const mainColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.82)';
    const mutedColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)';
    const arrowColor = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.65}
            style={[styles.row, { backgroundColor: bg, borderColor: border }]}
        >
            {/* Logo */}
            <FastImage
                source={{ uri: item.icon }}
                style={styles.logo}
                resizeMode={FastImage.resizeMode.cover}
            />

            {/* Text */}
            <View style={styles.info}>
                <Text style={[styles.symbol, { color: mainColor }]}>{item.symbol}</Text>
                <Text style={[styles.name, { color: mutedColor }]}>{item.name}</Text>
            </View>

            {/* Arrow */}
            <ArrowRight size={16} color={arrowColor} strokeWidth={1.5} />
        </TouchableOpacity>
    );
};

export const TokenSkeleton = ({ isDark }: { isDark: boolean }) => {
    const sk = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    const bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';

    return (
        <View style={[styles.row, { backgroundColor: bg, borderColor: border }]}>
            <View style={[styles.logo, { backgroundColor: sk }]} />
            <View style={styles.info}>
                <View style={[styles.skLine, { width: 48, height: 13, backgroundColor: sk }]} />
                <View style={[styles.skLine, { width: 90, height: 10, backgroundColor: sk, marginTop: 6 }]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderWidth: 1,
        marginBottom: 8,
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    info: {
        flex: 1,
    },
    symbol: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    name: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        includeFontPadding: false,
        marginTop: 3,
    },
    skLine: {
        borderRadius: 5,
    },
});