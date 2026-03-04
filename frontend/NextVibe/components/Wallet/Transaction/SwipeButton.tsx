import React, { useRef, useEffect } from "react";
import {
    Animated, View, StyleSheet, PanResponder,
    Dimensions, Vibration, Keyboard, Text
} from "react-native";
import { ChevronsRight, Check, X, Loader } from "lucide-react-native";

interface SwipeButtonProps {
    onSwipeSuccess: () => void;
    isLoading: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    isDark: boolean;
    text?: string;
}

const SW = Dimensions.get('window').width;
const TRACK_W = SW - 40;
const THUMB_SIZE = 54;  // circular thumb diameter
const TRACK_H = 62;
const THRESHOLD = TRACK_W * 0.75;

export const SwipeButton: React.FC<SwipeButtonProps> = ({
    onSwipeSuccess, isLoading, isSuccess, isFailed, isDark, text,
}) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const textOpacity = useRef(new Animated.Value(1)).current;
    const breathAnim = useRef(new Animated.Value(1)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const spinAnim = useRef(new Animated.Value(0)).current;
    const panXVal = useRef(0);
    const prevDx = useRef(0);
    const lastVibe = useRef(0);

    const bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)";
    const trackColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    const thumbFrom = isDark ? "#a78bfa" : "#7c3aed";
    const thumbTo = isDark ? "#6d28d9" : "#4c1d95";
    const labelColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.32)";

    // Breathing text
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(breathAnim, { toValue: 0.55, duration: 1600, useNativeDriver: true }),
            Animated.timing(breathAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, []);

    // Spinner
    useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
            ).start();
        } else {
            spinAnim.stopAnimation(); spinAnim.setValue(0);
        }
    }, [isLoading]);

    // Success scale
    useEffect(() => {
        if (isSuccess) Animated.spring(successScale, { toValue: 1, useNativeDriver: true }).start();
        else successScale.setValue(0);
    }, [isSuccess]);

    // Reset on failure
    useEffect(() => {
        if (isFailed) setTimeout(resetSwipe, 2000);
    }, [isFailed]);

    useEffect(() => {
        const id = pan.x.addListener(c => { panXVal.current = c.value; });
        return () => pan.x.removeListener(id);
    }, []);

    const resetSwipe = () => {
        Animated.parallel([
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
            Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
    };

    const panResponder = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
            prevDx.current = 0;
            pan.setOffset({ x: panXVal.current, y: 0 });
            pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, g) => {
            if (g.dx > 0 && g.dx < TRACK_W - THUMB_SIZE) {
                pan.setValue({ x: g.dx, y: 0 });
                textOpacity.setValue(Math.max(0, 1 - g.dx / (TRACK_W / 2)));
            }
            const now = Date.now();
            if (now - lastVibe.current > 55 && g.dx - prevDx.current > 2) {
                const p = g.dx / TRACK_W;
                if (p > 0.2) {
                    Vibration.vibrate(p > 0.8 ? 20 : p > 0.5 ? 10 : 5);
                    lastVibe.current = now;
                }
            }
            prevDx.current = g.dx;
        },
        onPanResponderRelease: (_, g) => {
            pan.flattenOffset();
            if (g.dx > THRESHOLD) {
                Vibration.vibrate(50);
                Keyboard.dismiss();
                onSwipeSuccess();
            } else resetSwipe();
        },
    })).current;

    const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const statusBg = isSuccess ? 'rgba(52,211,153,0.85)' : isFailed ? 'rgba(239,68,68,0.85)' : 'transparent';

    return (
        <View style={[styles.track, { backgroundColor: trackColor, borderColor: border }]}>
            {/* Label */}
            {!isSuccess && !isLoading && !isFailed && (
                <Animated.Text style={[styles.label, { color: labelColor, opacity: textOpacity }]}>
                    {text ?? "Swipe to send"}
                </Animated.Text>
            )}
            {isFailed && !isLoading && (
                <Animated.Text style={[styles.label, { color: 'rgba(239,68,68,0.8)', opacity: breathAnim }]}>
                    Failed — try again
                </Animated.Text>
            )}

            {/* Thumb */}
            {!isSuccess && !isLoading && !isFailed && (
                <Animated.View
                    style={[styles.thumb, { transform: [{ translateX: pan.x }] }]}
                    {...panResponder.panHandlers}
                >
                    <View style={[styles.thumbInner, { backgroundColor: thumbFrom }]}>
                        <ChevronsRight size={22} color="#fff" strokeWidth={2} />
                    </View>
                </Animated.View>
            )}

            {/* Status overlay */}
            {(isSuccess || isLoading || isFailed) && (
                <View style={[StyleSheet.absoluteFill, styles.statusOverlay, { backgroundColor: statusBg, borderRadius: TRACK_H / 2 }]}>
                    {isLoading && (
                        <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                            <Loader size={26} color={isDark ? "rgba(255,255,255,0.8)" : "#fff"} strokeWidth={1.8} />
                        </Animated.View>
                    )}
                    {isSuccess && (
                        <Animated.View style={{ transform: [{ scale: successScale }] }}>
                            <Check size={28} color="#fff" strokeWidth={2.5} />
                        </Animated.View>
                    )}
                    {isFailed && !isLoading && (
                        <X size={26} color="#fff" strokeWidth={2} />
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    track: {
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        borderWidth: 1,
        alignSelf: 'center',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    label: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        includeFontPadding: false,
        letterSpacing: 0.5,
    },
    thumb: {
        position: 'absolute',
        left: 4,
        top: (TRACK_H - THUMB_SIZE) / 2,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        overflow: 'hidden',
    },
    thumbInner: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: THUMB_SIZE / 2,
    },
    statusOverlay: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});