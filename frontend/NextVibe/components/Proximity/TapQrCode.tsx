import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

type Props = {
    /** The link to encode; null while it's being created. */
    value: string | null;
    size?: number;
    caption?: string;
};

/**
 * A scannable tap link. Always black on white with a quiet zone — phone
 * cameras struggle with inverted or low-contrast codes in dark mode.
 */
export default function TapQrCode({ value, size = 196, caption }: Props) {
    const isDark = useColorScheme() === 'dark';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    return (
        <View style={styles.wrap}>
            <View
                style={[styles.card, { width: size + space.xl, height: size + space.xl }]}
                accessibilityRole="image"
                accessibilityLabel="QR code for your tap link"
            >
                {value ? (
                    <QRCode value={value} size={size} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
                ) : (
                    <ActivityIndicator color={colors.accentDeep} />
                )}
            </View>
            {!!caption && <Text style={[styles.caption, { color: muted }]}>{caption}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        gap: space.sm,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
    },
    caption: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
