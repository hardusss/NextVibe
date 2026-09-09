import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, ActivityIndicator } from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    cancelAnimation,
    runOnJS,
    interpolate,
    Extrapolation,
    type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_KNOB_SIZE = 54;
const SWIPE_TRACK_WIDTH = SCREEN_WIDTH - 48;
const SWIPE_MAX = SWIPE_TRACK_WIDTH - SWIPE_KNOB_SIZE - 8;
const SWIPE_TRIGGER = SWIPE_MAX * 0.85;

export interface SwipeToCollectRef {
    reset: () => void;
}

interface SwipeToCollectColors {
    accent: string;
    accentDim: string;
    sub: string;
    card: string;
    swipeTrack: string;
    swipeBorder: string;
    errorText: string;
}

interface SwipeToCollectProps {
    /** Idle hint, e.g. "Swipe to collect". */
    label: string;
    /** Right-aligned label fading in as the knob travels. */
    releaseLabel: string;
    /** Shown instead of the hint while the flow is running. */
    busyLabel: string;
    busy: boolean;
    enabled: boolean;
    /** Inline error line under the track (already mapped to copy). */
    errorMessage: string | null;
    /** Optional error shake shared value from parent */
    shakeX?: SharedValue<number>;
    onTrigger: () => void;
    colors: SwipeToCollectColors;
}

/** The swipe-knob track: gradient fill, release hint, spinner while busy. */
const SwipeToCollect = forwardRef<SwipeToCollectRef, SwipeToCollectProps>(({
    label, releaseLabel, busyLabel, busy, enabled, errorMessage, shakeX, onTrigger, colors: c,
}, ref) => {
    const x = useSharedValue(0);
    const hasHapticked = useSharedValue(false);
    const shimmer = useSharedValue(0);

    const resetKnob = () => {
        hasHapticked.value = false;
        cancelAnimation(shimmer);
        shimmer.value = 0;
        x.value = withSpring(0, { damping: 16 });
    };

    useImperativeHandle(ref, () => ({
        reset: resetKnob,
    }));

    useEffect(() => {
        if (busy) {
            x.value = withTiming(SWIPE_MAX, { duration: 250 });
            shimmer.value = 0;
            shimmer.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
        } else {
            cancelAnimation(shimmer);
            shimmer.value = 0;
        }
    }, [busy]);

    const triggerHaptic = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const panGesture = Gesture.Pan()
        .enabled(enabled && !busy)
        .activeOffsetX(8)
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
            'worklet';
            const clamped = Math.max(0, Math.min(e.translationX, SWIPE_MAX));
            x.value = clamped;
            if (clamped >= SWIPE_TRIGGER && !hasHapticked.value) {
                hasHapticked.value = true;
                runOnJS(triggerHaptic)();
            } else if (clamped < SWIPE_TRIGGER && hasHapticked.value) {
                hasHapticked.value = false;
            }
        })
        .onEnd(() => {
            'worklet';
            if (x.value >= SWIPE_TRIGGER) {
                x.value = withSpring(SWIPE_MAX, { damping: 14 });
                runOnJS(onTrigger)();
            } else {
                hasHapticked.value = false;
                x.value = withSpring(0, { damping: 16 });
            }
        });

    const knobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
    }));

    const fillStyle = useAnimatedStyle(() => {
        if (busy) {
            return {
                width: SWIPE_TRACK_WIDTH,
                opacity: 1,
            };
        }
        return {
            width: x.value + SWIPE_KNOB_SIZE + 4,
            opacity: interpolate(x.value, [0, SWIPE_MAX * 0.15], [0.3, 1], Extrapolation.CLAMP),
        };
    });

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-SWIPE_TRACK_WIDTH, SWIPE_TRACK_WIDTH]) }],
        opacity: busy ? 1 : 0,
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: busy ? 0 : interpolate(x.value, [0, SWIPE_MAX * 0.5], [1, 0], Extrapolation.CLAMP),
    }));

    const releaseStyle = useAnimatedStyle(() => ({
        opacity: busy ? 0 : interpolate(x.value, [SWIPE_MAX * 0.7, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    }));

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeX ? shakeX.value : 0 }],
    }));

    return (
        <Reanimated.View style={containerStyle}>
            <View style={[
                styles.track,
                {
                    borderColor: enabled ? c.swipeBorder : c.card,
                    opacity: enabled || busy ? 1 : 0.5,
                },
            ]}>
                <LinearGradient
                    colors={[c.accentDim, 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                />
                <Reanimated.View style={[styles.fill, fillStyle]} pointerEvents="none">
                    <LinearGradient
                        colors={['rgba(168,85,247,0.4)', 'rgba(109,40,217,0.15)']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <Reanimated.View style={[StyleSheet.absoluteFillObject, shimmerStyle]}>
                        <LinearGradient
                            colors={['transparent', 'rgba(255,255,255,0.25)', 'transparent']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFillObject}
                        />
                    </Reanimated.View>
                </Reanimated.View>

                {busy ? (
                    <View style={styles.labelRow} pointerEvents="none">
                        <Text style={[styles.label, styles.labelBold, { color: c.accent }]}>
                            {busyLabel}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Reanimated.View style={[styles.labelRow, labelStyle]} pointerEvents="none">
                            <Text style={[styles.label, { color: c.sub }]}>
                                {label}
                            </Text>
                        </Reanimated.View>

                        <Reanimated.View style={[styles.releaseRow, releaseStyle]} pointerEvents="none">
                            <Text style={[styles.label, styles.labelBold, { color: c.accent }]}>{releaseLabel}</Text>
                        </Reanimated.View>
                    </>
                )}

                <GestureDetector gesture={panGesture}>
                    <Reanimated.View style={[styles.knob, knobStyle]}>
                        <LinearGradient
                            colors={busy ? ['#6d28d9', '#4c1d95'] : ['#a855f7', '#7c3aed']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={styles.knobGradient}
                        >
                            {busy
                                ? <ActivityIndicator color="white" size="small" />
                                : <ChevronRight size={24} color="white" strokeWidth={2.5} />
                            }
                        </LinearGradient>
                    </Reanimated.View>
                </GestureDetector>
            </View>

            {!!errorMessage && (
                <Text style={[styles.errorLine, { color: c.errorText }]} numberOfLines={2}>
                    {errorMessage}
                </Text>
            )}
        </Reanimated.View>
    );
});

const styles = StyleSheet.create({
    track: {
        width: SWIPE_TRACK_WIDTH,
        height: SWIPE_KNOB_SIZE + 10,
        borderRadius: (SWIPE_KNOB_SIZE + 10) / 2,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 5,
        overflow: 'hidden',
        position: 'relative',
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: (SWIPE_KNOB_SIZE + 10) / 2,
        overflow: 'hidden',
    },
    labelRow: {
        position: 'absolute',
        left: SWIPE_KNOB_SIZE + 20,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    releaseRow: {
        position: 'absolute',
        right: 20,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    labelBold: {
        fontFamily: 'Dank Mono Bold',
    },
    knob: {
        width: SWIPE_KNOB_SIZE,
        height: SWIPE_KNOB_SIZE,
        borderRadius: SWIPE_KNOB_SIZE / 2,
        overflow: 'hidden',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 10,
    },
    knobGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    errorLine: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        marginTop: 10,
        textAlign: 'center',
    },
});

export { SWIPE_TRACK_WIDTH };
export default SwipeToCollect;
