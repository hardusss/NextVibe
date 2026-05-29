import React, { useRef, useEffect, useCallback } from 'react';
import {
    Animated, View, StyleSheet, PanResponder,
    Dimensions, Vibration,
} from 'react-native';
import { ChevronsRight, Check, X, Loader } from 'lucide-react-native';
import type { SwapColors } from '@/src/types/swap';

interface SwapSwipeButtonProps {
    onSwipeSuccess: () => void;
    isLoading: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    colors: SwapColors;
}

const SW = Dimensions.get('window').width;
const TRACK_W = SW - 40;
const THUMB_SIZE = 54;
const TRACK_H = 62;
const THRESHOLD = TRACK_W * 0.75;

export default function SwapSwipeButton({
    onSwipeSuccess,
    isLoading,
    isSuccess,
    isFailed,
    colors,
}: SwapSwipeButtonProps) {
    const pan = useRef(new Animated.ValueXY()).current;
    const textOpacity = useRef(new Animated.Value(1)).current;
    const breathAnim = useRef(new Animated.Value(1)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const spinAnim = useRef(new Animated.Value(0)).current;
    const panXVal = useRef(0);
    const prevDx = useRef(0);
    const lastVibe = useRef(0);
    const onSwipeSuccessRef = useRef(onSwipeSuccess);

    useEffect(() => {
        onSwipeSuccessRef.current = onSwipeSuccess;
    }, [onSwipeSuccess]);

    const isInteractive = useRef(!isLoading && !isSuccess && !isFailed);

    useEffect(() => {
        isInteractive.current = !isLoading && !isSuccess && !isFailed;
    }, [isLoading, isSuccess, isFailed]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(breathAnim, { toValue: 0.45, duration: 1600, useNativeDriver: true }),
                Animated.timing(breathAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
            ).start();
        } else {
            spinAnim.stopAnimation();
            spinAnim.setValue(0);
        }
    }, [isLoading]);

    useEffect(() => {
        if (isSuccess) {
            Animated.spring(successScale, { toValue: 1, useNativeDriver: true }).start();
        } else {
            successScale.setValue(0);
        }
    }, [isSuccess]);

    useEffect(() => {
        const id = pan.x.addListener(c => { panXVal.current = c.value; });
        return () => pan.x.removeListener(id);
    }, []);

    const resetSwipe = useCallback(() => {
        Animated.parallel([
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
            Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
    }, [pan, textOpacity]);

    useEffect(() => {
        if (isFailed) {
            const t = setTimeout(resetSwipe, 2000);
            return () => clearTimeout(t);
        }
    }, [isFailed, resetSwipe]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => isInteractive.current,
            onMoveShouldSetPanResponder: (_, g) => isInteractive.current && Math.abs(g.dx) > 2,
            
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponderCapture: (_, g) => {
                return isInteractive.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 2;
            },

            onPanResponderGrant: () => {
                prevDx.current = 0;
                pan.setOffset({ x: panXVal.current, y: 0 });
                pan.setValue({ x: 0, y: 0 });
                Vibration.vibrate(10);
            },

            onPanResponderMove: (_, g) => {
                if (g.dx > 0 && g.dx < TRACK_W - THUMB_SIZE) {
                    pan.setValue({ x: g.dx, y: 0 });
                    textOpacity.setValue(Math.max(0, 1 - g.dx / (TRACK_W / 2)));
                }

                const now = Date.now();
                const moved = g.dx - prevDx.current;
                if (now - lastVibe.current > 55 && moved > 2) {
                    const progress = g.dx / TRACK_W;
                    if (progress > 0.2) {
                        Vibration.vibrate(progress > 0.8 ? 25 : progress > 0.5 ? 12 : 5);
                        lastVibe.current = now;
                    }
                }
                prevDx.current = g.dx;
            },

           onPanResponderRelease: (_, g) => {
                pan.flattenOffset();
                if (g.dx > THRESHOLD) {
                    Vibration.vibrate(60);
                    Animated.spring(pan, {
                        toValue: { x: TRACK_W - THUMB_SIZE, y: 0 },
                        useNativeDriver: true
                    }).start();
                    
                    onSwipeSuccessRef.current(); 
                } else {
                    Vibration.vibrate(15);
                    Animated.parallel([
                        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
                        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                    ]).start();
                }
            },

            onPanResponderTerminate: () => {
                pan.flattenOffset();
                Animated.parallel([
                    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
                    Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start();
            }
        })
    ).current;

    const spinDeg = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const statusBg = isSuccess
        ? 'rgba(52,211,153,0.95)'
        : isFailed
            ? 'rgba(239,68,68,0.95)'
            : isLoading
                ? (colors.isDark ? 'rgba(168,85,247,0.95)' : 'rgba(124,58,237,0.95)')
                : 'transparent';

    const isIdle = !isSuccess && !isLoading && !isFailed;

    return (
        <View style={[styles.track, { borderColor: colors.cardBorder }]}>
            <LinearTrack colors={colors} />

            {isIdle && (
                <Animated.Text style={[styles.label, { color: colors.muted, opacity: textOpacity }]}>
                    swipe to swap
                </Animated.Text>
            )}

            {isFailed && !isLoading && (
                <Animated.Text style={[styles.label, { color: 'rgba(239,68,68,0.8)', opacity: breathAnim }]}>
                    failed — try again
                </Animated.Text>
            )}

            <Animated.View
                style={[styles.thumb, { transform: [{ translateX: pan.x }] }]}
                {...panResponder.panHandlers}
            >
                <View style={[styles.thumbInner, { backgroundColor: '#A855F7' }]}>
                    <ChevronsRight size={22} color="#fff" strokeWidth={2} />
                </View>
            </Animated.View>

            {(isSuccess || isLoading || isFailed) && (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        styles.statusOverlay,
                        { backgroundColor: statusBg, borderRadius: TRACK_H / 2, zIndex: 10, elevation: 10 },
                    ]}
                >
                    {isLoading && (
                        <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                            <Loader size={26} color="#fff" strokeWidth={2} />
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
}

function LinearTrack({ colors }: { colors: SwapColors }) {
    return (
        <View
            style={[
                StyleSheet.absoluteFill,
                {
                    backgroundColor: colors.chip,
                    borderRadius: TRACK_H / 2,
                    borderWidth: 1,
                    borderColor: colors.chipBorder,
                },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    track: {
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
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
        letterSpacing: 1,
    },
    thumb: {
        position: 'absolute',
        left: 4,
        top: (TRACK_H - THUMB_SIZE) / 2,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        overflow: 'hidden',
        zIndex: 20,
    },
    thumbInner: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: THUMB_SIZE / 2,
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 8,
    },
    statusOverlay: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});