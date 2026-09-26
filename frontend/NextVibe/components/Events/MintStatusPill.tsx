import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Gem, AlertTriangle, Bookmark } from 'lucide-react-native';
import Animated, {
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useRepCountUp } from '@/hooks/useRepCountUp';
import { MOTION } from '@/constants/motion';
import { space, radius, type as typeScale } from '@/src/theme/tokens';

export type MintPillStatus = 'minting' | 'success' | 'saved' | 'failed';

type MintStatusPillProps = {
    status: MintPillStatus;
    points?: number;
    onRetry?: () => void;
};

/**
 * Compact POAP status chip for the check-in pass: minting, on Solana (+REP),
 * saved off-chain (no wallet), or failed with Retry. The failure's reason is
 * shown by the screen under the event name.
 */
export default function MintStatusPill({ status, points = 0, onRetry }: MintStatusPillProps) {
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const displayPoints = useRepCountUp(status === 'success', points);

    const pulse = useSharedValue(1);
    useEffect(() => {
        if (status === 'minting' && !reduceMotion) {
            pulse.value = withRepeat(
                withSequence(
                    withTiming(0.35, { duration: MOTION.duration.slow }),
                    withTiming(1, { duration: MOTION.duration.slow })
                ),
                -1,
                true
            );
        } else {
            pulse.value = withTiming(1, { duration: MOTION.duration.fast });
        }
    }, [status, reduceMotion]);
    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

    const tone = TONES[status][isDark ? 'dark' : 'light'];
    const enter = reduceMotion ? undefined : FadeIn.duration(MOTION.duration.fast);

    let body: React.ReactNode;
    if (status === 'minting') {
        body = (
            <>
                <Animated.View style={[styles.dot, { backgroundColor: tone.icon }, pulseStyle]} />
                <Text style={[styles.text, { color: tone.text }]}>Minting POAP…</Text>
            </>
        );
    } else if (status === 'saved') {
        body = (
            <>
                <Bookmark size={13} color={tone.icon} strokeWidth={2.2} />
                <Text style={[styles.text, { color: tone.text }]}>POAP saved · claim anytime</Text>
            </>
        );
    } else if (status === 'failed') {
        body = (
            <>
                <AlertTriangle size={13} color={tone.icon} strokeWidth={2.2} />
                <Text style={[styles.text, { color: tone.text }]}>POAP didn't go through</Text>
                {onRetry && (
                    <TouchableOpacity onPress={onRetry} activeOpacity={0.7} hitSlop={10}
                        accessibilityRole="button" accessibilityLabel="Retry minting">
                        <Text style={[styles.text, styles.retry, { color: tone.text }]}>Retry</Text>
                    </TouchableOpacity>
                )}
            </>
        );
    } else {
        body = (
            <>
                <Gem size={13} color={tone.icon} strokeWidth={2.2} />
                <Text style={[styles.text, { color: tone.text }]}>
                    {points > 0 ? `POAP minted · +${displayPoints} REP` : 'POAP in your collection'}
                </Text>
            </>
        );
    }

    return (
        <Animated.View
            key={status}
            entering={enter}
            style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}
            accessibilityLiveRegion="polite"
        >
            {body}
        </Animated.View>
    );
}

type Tone = { bg: string; border: string; text: string; icon: string };
const TONES: Record<MintPillStatus, { dark: Tone; light: Tone }> = {
    minting: {
        dark: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: '#C4B5FD', icon: '#C4B5FD' },
        light: { bg: 'rgba(17,24,39,0.04)', border: 'rgba(17,24,39,0.08)', text: '#6D28D9', icon: '#7C3AED' },
    },
    success: {
        dark: { bg: 'rgba(168,85,247,0.16)', border: 'rgba(196,181,253,0.30)', text: '#F3E8FF', icon: '#D8B4FE' },
        light: { bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.22)', text: '#5B21B6', icon: '#7C3AED' },
    },
    saved: {
        dark: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: '#E9D5FF', icon: '#C4B5FD' },
        light: { bg: 'rgba(17,24,39,0.04)', border: 'rgba(17,24,39,0.08)', text: '#4C1D95', icon: '#7C3AED' },
    },
    failed: {
        dark: { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.28)', text: '#FDE68A', icon: '#FCD34D' },
        light: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.25)', text: '#92400E', icon: '#D97706' },
    },
};

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs + 2,
        height: 30,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    text: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
    retry: {
        textDecorationLine: 'underline',
        marginLeft: 2,
    },
});
