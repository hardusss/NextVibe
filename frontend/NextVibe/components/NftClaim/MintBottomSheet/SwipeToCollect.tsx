import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, ActivityIndicator, Animated } from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation,
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
    /** Error shake, driven by the parent. */
    shakeX: Animated.Value;
    onTrigger: () => void;
    colors: SwipeToCollectColors;
}

/** The swipe-knob track: gradient fill, release hint, spinner while busy. */
const SwipeToCollect = forwardRef<SwipeToCollectRef, SwipeToCollectProps>(({
    label, releaseLabel, busyLabel, busy, enabled, errorMessage, shakeX, onTrigger, colors: c,
}, ref) => {
    const swipeX = useSharedValue(0);
    const swipeTriggered = useSharedValue(false);

    useImperativeHandle(ref, () => ({
        reset: () => {
            swipeTriggered.value = false;
            swipeX.value = withSpring(0, { damping: 15 });
        },
    }));

    const fireTrigger = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onTrigger();
    };

    const panGesture = Gesture.Pan()
        .hitSlop({ top: 15, bottom: 15, left: 10, right: 10 })
        .onUpdate((e) => {
            if (swipeTriggered.value || !enabled) return;
            swipeX.value = Math.max(0, Math.min(e.translationX, SWIPE_MAX));
            if (swipeX.value >= SWIPE_TRIGGER) {
                swipeTriggered.value = true;
                swipeX.value = withSpring(SWIPE_MAX, { damping: 12 });
                runOnJS(fireTrigger)();
            }
        })
        .onEnd(() => {
            if (!swipeTriggered.value) {
                swipeX.value = withSpring(0, { damping: 15 });
            }
        });

    const knobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: swipeX.value }],
    }));

    const fillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(swipeX.value, [0, SWIPE_MAX], [0, 1], Extrapolation.CLAMP),
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: interpolate(swipeX.value, [0, SWIPE_MAX * 0.35], [1, 0], Extrapolation.CLAMP),
    }));

    const releaseStyle = useAnimatedStyle(() => ({
        opacity: interpolate(swipeX.value, [SWIPE_MAX * 0.45, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
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
                </Reanimated.View>

                <Reanimated.View style={[styles.labelRow, labelStyle]} pointerEvents="none">
                    <Text style={[styles.label, { color: busy ? c.accent : c.sub }, busy && styles.labelBold]}>
                        {busy ? busyLabel : label}
                    </Text>
                </Reanimated.View>

                <Reanimated.View style={[styles.releaseRow, releaseStyle]} pointerEvents="none">
                    <Text style={[styles.label, styles.labelBold, { color: c.accent }]}>{releaseLabel}</Text>
                </Reanimated.View>

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
        </Animated.View>
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
        ...StyleSheet.absoluteFillObject,
        borderRadius: (SWIPE_KNOB_SIZE + 10) / 2,
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
