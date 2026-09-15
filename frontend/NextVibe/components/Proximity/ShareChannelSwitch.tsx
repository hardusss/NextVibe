import React from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Bluetooth, Nfc, QrCode } from 'lucide-react-native';
import haptics from '@/src/utils/haptics';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import { SHARE_CHANNEL_OPTIONS, type ShareChannel } from '@/hooks/useShareChannel';

type Props = {
    channel: ShareChannel;
    onChange: (channel: ShareChannel) => void;
    /** False on Android phones without NFC: there is nothing to choose. */
    canChoose: boolean;
    disabled?: boolean;
};

const META: Record<ShareChannel, { label: string; Icon: typeof Nfc; note: string }> = {
    nfc: {
        label: 'NFC',
        Icon: Nfc,
        note: 'Phones must touch. Their phone reads yours even without NextVibe open.',
    },
    bluetooth: {
        label: 'Bluetooth',
        Icon: Bluetooth,
        note: 'Hold the phones together. NextVibe must be open on their phone.',
    },
    qr: {
        label: 'QR code',
        Icon: QrCode,
        note: 'They scan the code with their camera — no Bluetooth needed.',
    },
};

/**
 * How this phone shares its tap code: NFC / Bluetooth on Android, Bluetooth /
 * QR code on iPhone. The user asked for an explicit switch, so the transport
 * names are the labels.
 */
export default function ShareChannelSwitch({ channel, onChange, canChoose, disabled = false }: Props) {
    const isDark = useColorScheme() === 'dark';
    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    if (!canChoose) {
        return (
            <Text style={[styles.note, styles.wrap, { color: muted }]}>
                This phone has no NFC — sharing over Bluetooth.
            </Text>
        );
    }

    return (
        <View style={styles.wrap}>
            <View
                style={[
                    styles.track,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        borderColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
                        opacity: disabled ? 0.5 : 1,
                    },
                ]}
                accessibilityRole="radiogroup"
            >
                {SHARE_CHANNEL_OPTIONS.map((value) => {
                    const { label, Icon } = META[value];
                    const selected = channel === value;
                    return (
                        <Pressable
                            key={value}
                            disabled={disabled}
                            onPress={() => {
                                if (selected) return;
                                haptics.selection();
                                onChange(value);
                            }}
                            hitSlop={4}
                            style={[styles.option, selected && styles.optionSelected]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled }}
                            accessibilityLabel={`Share with ${label}`}
                        >
                            <Icon size={15} color={selected ? '#ffffff' : muted} strokeWidth={2} />
                            <Text style={[styles.label, { color: selected ? '#ffffff' : main }]}>{label}</Text>
                        </Pressable>
                    );
                })}
            </View>
            <Text style={[styles.note, { color: muted }]}>{META[channel].note}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        alignItems: 'center',
        marginTop: space.md,
        gap: space.xs + 2,
    },
    track: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: radius.pill,
        padding: 3,
        gap: 3,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs + 2,
        minHeight: 36,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
    },
    optionSelected: {
        backgroundColor: colors.accent,
    },
    label: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.caption + 1,
        includeFontPadding: false,
    },
    note: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        lineHeight: 15,
        textAlign: 'center',
        includeFontPadding: false,
        paddingHorizontal: space.sm,
    },
});
