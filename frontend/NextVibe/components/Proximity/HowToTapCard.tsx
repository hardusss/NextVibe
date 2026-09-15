import React from 'react';
import { View, Text, StyleSheet, useColorScheme, Platform } from 'react-native';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

type Props = {
    /** Who the other person is expected to be. */
    audience: 'friend' | 'attendee' | 'organizer';
};

/**
 * Three numbered steps that answer "what do we actually do?" for both
 * people. Transport names appear only in the small footnote.
 */
export default function HowToTapCard({ audience }: Props) {
    const isDark = useColorScheme() === 'dark';
    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    const steps = audience === 'organizer'
        ? [
            'Attendees open NextVibe on their phone',
            'They hold their phone against yours for a second',
            'Their check-in appears in the list below',
        ]
        : [
            audience === 'attendee'
                ? 'The other attendee opens Profile → Tap to Meet'
                : 'Your friend opens NextVibe → Profile → Tap to Meet',
            'Hold the phones back to back for a second',
            'Tap Confirm on the card that pops up',
        ];

    const footnote = Platform.OS === 'android'
        ? 'Works over Bluetooth with the app open. With NFC on, any phone can also read yours with a tap — iPhones show a banner to open.'
        : 'Works over Bluetooth with NextVibe open on both phones. Android phones with NFC can also be tapped against the top of your iPhone.';

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
                },
            ]}
        >
            {steps.map((step, index) => (
                <View key={step} style={styles.step}>
                    <View style={styles.bullet}>
                        <Text style={styles.bulletText}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: main }]}>{step}</Text>
                </View>
            ))}
            <Text style={[styles.footnote, { color: muted }]}>{footnote}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        borderRadius: radius.lg,
        borderWidth: 1,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        gap: space.sm + 2,
        marginTop: space.md,
    },
    step: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    bullet: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(168,85,247,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulletText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.caption,
        color: colors.accent,
        includeFontPadding: false,
    },
    stepText: {
        flex: 1,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 5,
        includeFontPadding: false,
    },
    footnote: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        lineHeight: 16,
        marginTop: 2,
        includeFontPadding: false,
    },
});
