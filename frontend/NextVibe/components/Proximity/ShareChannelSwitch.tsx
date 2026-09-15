import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Bluetooth, Nfc } from 'lucide-react-native';
import haptics from '@/src/utils/haptics';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import type { ShareChannel } from '@/hooks/useShareChannel';

type Props = {
    channel: ShareChannel;
    onChange: (channel: ShareChannel) => void;
    nfcAvailable: boolean;
    disabled?: boolean;
};

const OPTIONS: { value: ShareChannel; label: string; Icon: typeof Nfc }[] = [
    { value: 'nfc', label: 'NFC', Icon: Nfc },
    { value: 'bluetooth', label: 'Bluetooth', Icon: Bluetooth },
];

/**
 * Android-only choice of how this phone shares its tap code. The user asked
 * for an explicit switch here, so the transport names are the labels.
 */
export default function ShareChannelSwitch({ channel, onChange, nfcAvailable, disabled = false }: Props) {
    const isDark = useColorScheme() === 'dark';
    if (Platform.OS !== 'android') return null;

    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    if (!nfcAvailable) {
        return (
            <Text style={[styles.note, { color: muted }]}>
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
                {OPTIONS.map(({ value, label, Icon }) => {
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
                            style={[styles.option, selected && styles.optionSelected]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled }}
                            accessibilityLabel={`Share over ${label}`}
                        >
                            <Icon size={15} color={selected ? '#ffffff' : muted} strokeWidth={2} />
                            <Text style={[styles.label, { color: selected ? '#ffffff' : main }]}>{label}</Text>
                        </Pressable>
                    );
                })}
            </View>
            <Text style={[styles.note, { color: muted }]}>
                {channel === 'nfc'
                    ? 'Phones must touch. Their phone reads yours even without NextVibe open.'
                    : 'Works a few centimetres apart. NextVibe must be open on their phone.'}
            </Text>
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
