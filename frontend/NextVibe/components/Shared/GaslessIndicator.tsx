import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Zap, ZapOff } from 'lucide-react-native';
import Animated, {
    useAnimatedStyle,
    withSpring,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import usePaymaster from '@/hooks/usePaymaster';

/**
 * GaslessIndicator
 *
 * Displays the user's daily gasless transaction usage as a subtle pill:
 *   "3 / 10 Free Interactions"
 *
 * Color-coded:
 *   - Green:  0-6 used  (plenty of headroom)
 *   - Amber:  7-9 used  (running low)
 *   - Red:    10/10     (limit reached)
 *
 * Designed to drop into Settings, transaction screens, or any
 * wallet-adjacent surface without dominating the layout.
 */
export default function GaslessIndicator() {
    const isDark = useColorScheme() === 'dark';
    const { txCountToday, maxTxPerDay, isGaslessAvailable, isLoading } = usePaymaster();

    const progressWidth = useSharedValue(0);

    useEffect(() => {
        const ratio = Math.min(txCountToday / maxTxPerDay, 1);
        progressWidth.value = withSpring(ratio, { damping: 20, stiffness: 120 });
    }, [txCountToday, maxTxPerDay]);

    const progressStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value * 100}%`,
    }));

    if (isLoading) return null;

    // Color tiers
    const remaining = maxTxPerDay - txCountToday;
    const tier = remaining <= 0 ? 'red' : remaining <= 3 ? 'amber' : 'green';

    const tierColors = {
        green: {
            accent: '#10B981',
            accentMuted: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
            progressBg: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.2)',
            text: isDark ? '#6EE7B7' : '#059669',
            border: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.2)',
        },
        amber: {
            accent: '#F59E0B',
            accentMuted: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
            progressBg: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.2)',
            text: isDark ? '#FCD34D' : '#D97706',
            border: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.2)',
        },
        red: {
            accent: '#EF4444',
            accentMuted: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
            progressBg: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)',
            text: isDark ? '#FCA5A5' : '#DC2626',
            border: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)',
        },
    };

    const c = tierColors[tier];
    const IconComponent = isGaslessAvailable ? Zap : ZapOff;

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: c.accentMuted,
                    borderColor: c.border,
                },
            ]}
        >
            <View style={styles.header}>
                <View style={[styles.iconWrap, { backgroundColor: c.accentMuted }]}>
                    <IconComponent size={16} color={c.accent} strokeWidth={2.5} />
                </View>

                <View style={styles.textContent}>
                    <Text
                        style={[
                            styles.title,
                            { color: isDark ? '#F9FAFB' : '#111827' },
                        ]}
                    >
                        {isGaslessAvailable ? 'Free Interactions' : 'Daily Limit Reached'}
                    </Text>
                    <Text style={[styles.subtitle, { color: c.text }]}>
                        {txCountToday} / {maxTxPerDay} used today
                    </Text>
                </View>
            </View>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: c.progressBg }]}>
                <Animated.View
                    style={[
                        styles.progressFill,
                        progressStyle,
                        { backgroundColor: c.accent },
                    ]}
                />
            </View>

            {!isGaslessAvailable && (
                <Text
                    style={[
                        styles.limitText,
                        { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' },
                    ]}
                >
                    Transactions will use your wallet's SOL for fees until tomorrow.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginVertical: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContent: {
        flex: 1,
        gap: 2,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        includeFontPadding: false,
    },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    limitText: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        marginTop: 10,
        includeFontPadding: false,
        lineHeight: 16,
    },
});
