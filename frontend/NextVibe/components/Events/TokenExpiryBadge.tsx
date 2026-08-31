import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, RefreshCw } from 'lucide-react-native';

interface TokenExpiryBadgeProps {
    secondsLeft: number;
    totalDuration?: number;
    isRenewing?: boolean;
    label?: string;
}

export default function TokenExpiryBadge({
    secondsLeft,
    totalDuration = 50,
    isRenewing = false,
    label = "Dynamic Proximity Token",
}: TokenExpiryBadgeProps) {
    const isDark = useColorScheme() === 'dark';

    // Pulse animation for the live dot
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.7);
    const progressWidth = useSharedValue(1);

    useEffect(() => {
        pulseScale.value = withRepeat(
            withSequence(
                withTiming(1.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
        pulseOpacity.value = withRepeat(
            withSequence(
                withTiming(0.2, { duration: 900 }),
                withTiming(0.8, { duration: 900 })
            ),
            -1,
            true
        );
    }, []);

    useEffect(() => {
        const ratio = Math.max(0, Math.min(1, secondsLeft / totalDuration));
        progressWidth.value = withTiming(ratio, { duration: 950, easing: Easing.linear });
    }, [secondsLeft, totalDuration]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const progressBarStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value * 100}%`,
    }));

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const mainColor = isDark ? '#ffffff' : '#111827';
    const mutedColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)';
    const cardBg = isDark ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.05)';
    const borderColor = isDark ? 'rgba(168,85,247,0.22)' : 'rgba(168,85,247,0.18)';

    return (
        <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.contentRow}>
                {/* Status Dot + Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.dotWrapper}>
                        <Animated.View style={[styles.pulseRing, pulseStyle]} />
                        <View style={styles.solidDot} />
                    </View>
                    <ShieldCheck size={16} color="#A855F7" strokeWidth={2} />
                </View>

                {/* Info Text */}
                <View style={styles.textContainer}>
                    <Text style={[styles.title, { color: mainColor }]}>{label}</Text>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>
                        {isRenewing ? 'Refreshing security token...' : 'Temporary & Anti-Sybil Protected'}
                    </Text>
                </View>

                {/* Countdown Timer Pill */}
                <View style={styles.timerBadge}>
                    {isRenewing ? (
                        <RefreshCw size={12} color="#c084fc" />
                    ) : (
                        <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
                    )}
                </View>
            </View>

            {/* Glowing animated progress bar */}
            <View style={styles.progressBarBackground}>
                <Animated.View style={[styles.progressBarFill, progressBarStyle]}>
                    <LinearGradient
                        colors={['#A855F7', '#05f0d8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        paddingTop: 12,
        paddingHorizontal: 14,
        paddingBottom: 10,
        marginVertical: 10,
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    iconContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginRight: 8,
    },
    dotWrapper: {
        width: 12,
        height: 12,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    pulseRing: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#05f0d8',
    },
    solidDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#05f0d8',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 13,
        letterSpacing: 0.1,
    },
    subtitle: {
        fontFamily: 'Dank Mono',
        fontSize: 11,
        marginTop: 2,
    },
    timerBadge: {
        backgroundColor: 'rgba(168,85,247,0.18)',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 46,
    },
    timerText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 12,
        color: '#c084fc',
    },
    progressBarBackground: {
        height: 3,
        width: '100%',
        backgroundColor: 'rgba(168,85,247,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
});
