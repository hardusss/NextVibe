import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Check, AlertTriangle } from 'lucide-react-native';
import Animated, {
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import GlassSurface from '@/components/Shared/GlassSurface';
import CustomActivityIndicator from '@/components/CustomActivityIndicator';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useRepCountUp } from '@/hooks/useRepCountUp';
import { MOTION } from '@/constants/motion';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

export type MintPillStatus = 'minting' | 'success' | 'failed';

type MintStatusPillProps = {
    status: MintPillStatus;
    points?: number;
    error?: string | null;
    onRetry?: () => void;
};

/**
 * Compact lazy-mint indicator. Lives between the event info and the CTAs so
 * the mint never blocks the rest of the screen.
 */
export default function MintStatusPill({ status, points = 0, error, onRetry }: MintStatusPillProps) {
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const displayPoints = useRepCountUp(status === 'success', points);

    const pulse = useSharedValue(1);
    useEffect(() => {
        if (status === 'minting' && !reduceMotion) {
            pulse.value = withRepeat(
                withSequence(
                    withTiming(0.6, { duration: MOTION.duration.slow }),
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

    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';
    const enter = reduceMotion ? undefined : FadeIn.duration(MOTION.duration.fast);

    if (status === 'failed') {
        return (
            <Animated.View
                key="failed"
                entering={enter}
                style={[styles.pill, styles.failedPill]}
                accessibilityLiveRegion="polite"
            >
                <AlertTriangle size={16} color={colors.danger} />
                <Text style={[styles.text, { color: colors.danger, flexShrink: 1 }]} numberOfLines={2}>
                    {error || 'Minting failed.'}
                </Text>
                {onRetry && (
                    <TouchableOpacity onPress={onRetry} activeOpacity={0.7} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry minting">
                        <Text style={[styles.text, styles.retryText]}>Retry</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        );
    }

    return (
        <Animated.View key={status} entering={enter} accessibilityLiveRegion="polite">
            <GlassSurface
                style={[
                    styles.pill,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        borderWidth: 1,
                        borderColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
                    },
                ]}
                glassEffectStyle="regular"
                colorScheme={isDark ? 'dark' : 'light'}
            >
                {status === 'minting' ? (
                    <>
                        <CustomActivityIndicator size="small" style={styles.spinner} />
                        <Animated.Text style={[styles.text, { color: mutedColor }, pulseStyle]}>
                            Minting your cNFT…
                        </Animated.Text>
                    </>
                ) : (
                    <>
                        <View style={styles.checkCircle}>
                            <Check size={13} color={colors.success} strokeWidth={3} />
                        </View>
                        <Text style={[styles.text, { color: colors.success }]}>
                            {points > 0 ? `cNFT minted · +${displayPoints} pts` : 'Already in your collection'}
                        </Text>
                    </>
                )}
            </GlassSurface>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        borderRadius: radius.pill,
        paddingHorizontal: space.lg,
        paddingVertical: space.xs,
        minHeight: 44,
        overflow: 'hidden',
    },
    failedPill: {
        backgroundColor: 'rgba(248,113,113,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.25)',
        paddingVertical: space.sm,
    },
    spinner: {
        width: 36,
        height: 36,
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(74,222,128,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    retryText: {
        color: colors.accent,
        textDecorationLine: 'underline',
        marginLeft: space.xs,
    },
});
