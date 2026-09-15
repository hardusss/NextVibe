import React from 'react';
import { View, Text, StyleSheet, useColorScheme, Platform } from 'react-native';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import type { ShareChannel } from '@/hooks/useShareChannel';

type Props = {
    /** Who the other person is expected to be. */
    audience: 'friend' | 'attendee' | 'organizer';
    /** How this phone shares (Android switch); iPhones always use Bluetooth. */
    channel?: ShareChannel;
};

/**
 * Three numbered steps that answer "what do we actually do?" for both
 * people, for the channel this phone is sharing on.
 */
export default function HowToTapCard({ audience, channel = 'bluetooth' }: Props) {
    const isDark = useColorScheme() === 'dark';
    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';
    const nfc = Platform.OS === 'android' && channel === 'nfc';

    let steps: string[];
    let footnote: string;

    if (channel === 'qr') {
        steps = audience === 'organizer'
            ? [
                'Attendees open their phone’s camera',
                'They point it at this code and tap the NextVibe link',
                'Their check-in appears in the list below',
            ]
            : [
                'They open their phone’s camera and point it at the code',
                'They tap the NextVibe link that appears',
                'They tap Confirm on the card that pops up',
            ];
        footnote = 'Needs NextVibe installed on their phone. The code refreshes automatically, so show it live — screenshots stop working.';
    } else if (nfc) {
        steps = audience === 'organizer'
            ? [
                'Attendees hold their phone against the back of yours',
                'iPhones show a NextVibe banner — they tap it',
                'Their check-in appears in the list below',
            ]
            : [
                'Hold the back of your phone against theirs — on an iPhone, its top edge',
                'An iPhone shows a NextVibe banner to tap; Android opens NextVibe by itself',
                'They tap Confirm on the card that pops up',
            ];
        footnote = 'NFC works even if NextVibe isn’t open on their phone. If nothing happens, check NFC is on for both — or switch to Bluetooth.';
    } else {
        steps = audience === 'organizer'
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
        footnote = Platform.OS === 'android'
            ? 'Bluetooth needs NextVibe open on both phones. Switch to NFC to tap phones without the app open.'
            : 'Works over Bluetooth with NextVibe open on both phones. If it doesn’t catch, switch to QR code.';
    }

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
