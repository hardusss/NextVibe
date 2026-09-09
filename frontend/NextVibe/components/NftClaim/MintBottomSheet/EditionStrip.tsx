import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    cancelAnimation,
    interpolate,
} from 'react-native-reanimated';
import { Handshake } from 'lucide-react-native';

interface EditionStripColors {
    accent: string;
    sub: string;
    text: string;
}

interface EditionStripProps {
    total: number;
    minted: number;
    /** True when the IRL reservation window is open and the viewer is not eligible. */
    reservedForOthers: boolean;
    /** How many early editions are IRL-reserved (editions 2..1+reservedCount). */
    reservedCount: number;
    /** First edition a non-IRL collector can get while reservations are active. */
    firstOpenEdition: number;
    reduceMotion: boolean;
    colors: EditionStripColors;
}

/**
 * All editions as a two-row dot grid: minted = filled, IRL-reserved = hollow
 * outline, free = dim. The viewer's upcoming edition pulses.
 */
const EditionStrip = ({
    total, minted, reservedForOthers, reservedCount, firstOpenEdition,
    reduceMotion, colors: c,
}: EditionStripProps) => {
    const pulse = useSharedValue(0);

    useEffect(() => {
        if (reduceMotion) return;
        pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
        return () => cancelAnimation(pulse);
    }, [reduceMotion]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: interpolate(pulse.value, [0, 1], [0.35, 1]),
        transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.35]) }],
    }));

    const left = Math.max(0, total - minted);
    // The viewer's next edition: skips the reserved block when it's not theirs.
    const upcoming = reservedForOthers && minted + 1 < firstOpenEdition
        ? firstOpenEdition
        : minted + 1;

    const dots = Array.from({ length: total }, (_, i) => {
        const edition = i + 1;
        const isMinted = edition <= minted;
        const isReserved = !isMinted
            && reservedForOthers
            && edition >= 2
            && edition <= 1 + reservedCount;
        const isUpcoming = !isMinted && edition === upcoming && left > 0;
        return { edition, isMinted, isReserved, isUpcoming };
    });

    return (
        <View style={styles.wrap}>
            <View style={styles.grid}>
                {dots.map(({ edition, isMinted, isReserved, isUpcoming }) => {
                    const base = [
                        styles.dot,
                        isMinted
                            ? { backgroundColor: c.accent }
                            : isReserved
                                ? { borderWidth: 1, borderColor: c.accent, backgroundColor: 'transparent' }
                                : { backgroundColor: c.sub, opacity: 0.25 },
                    ];
                    if (isUpcoming) {
                        return (
                            <Reanimated.View
                                key={edition}
                                style={[styles.dot, { backgroundColor: c.accent }, !reduceMotion && pulseStyle]}
                            />
                        );
                    }
                    return <View key={edition} style={base} />;
                })}
            </View>
            <Text style={[styles.leftLabel, { color: c.text }]}>
                {left} left
            </Text>
            {reservedForOthers && left > 0 && (
                <View style={styles.irlNoteRow}>
                    <Handshake size={13} color={c.sub} />
                    <Text style={[styles.irlNoteText, { color: c.sub }]}>
                        Early editions are reserved for people who met the author IRL — you can still collect from #{firstOpenEdition}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        marginBottom: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 5,
        maxWidth: 25 * 13,
        marginBottom: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    leftLabel: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    irlNoteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
        paddingHorizontal: 8,
    },
    irlNoteText: {
        fontSize: 11,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        flexShrink: 1,
    },
});

export default EditionStrip;
