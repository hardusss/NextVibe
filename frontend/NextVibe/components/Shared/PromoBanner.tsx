import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, Animated, StyleSheet,
    Dimensions, Linking, PanResponder,
} from 'react-native';
import { X, Star, Twitter } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Config ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'promo_banner_state';
const MIN_SESSION_GAP = 3;          // show after every N-th app session
const COOLDOWN_HOURS = 48;          // minimum hours between any promo display
const RATE_LINK = 'solanadappstore://details?id=com.nextvibe.app';
const X_LINK = 'https://x.com/NextVibeWeb3';
const AUTO_DISMISS_MS = 12_000;     // auto-hide after 12s if user ignores

type PromoKind = 'rate' | 'follow_x';

interface StoredState {
    sessionCount: number;
    lastShownAt: number;           // unix ms
    lastKind: PromoKind | null;
}

const DEFAULT_STATE: StoredState = { sessionCount: 0, lastShownAt: 0, lastKind: null };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadState(): Promise<StoredState> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : DEFAULT_STATE;
    } catch {
        return DEFAULT_STATE;
    }
}

async function saveState(s: StoredState) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PromoBanner() {
    const [kind, setKind] = useState<PromoKind | null>(null);
    const [visible, setVisible] = useState(false);
    const translateY = useRef(new Animated.Value(200)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    // Swipe-to-dismiss
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
            onPanResponderMove: (_, g) => {
                if (g.dy > 0) translateY.setValue(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 40) {
                    dismiss();
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 120,
                        friction: 9,
                    }).start();
                }
            },
        })
    ).current;

    const dismiss = useCallback(() => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: 200, duration: 280, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => setVisible(false));
    }, []);

    const show = useCallback(() => {
        setVisible(true);
        translateY.setValue(200);
        opacity.setValue(0);
        Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }),
            Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]).start();
    }, []);

    // Decide on mount whether to display
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        (async () => {
            const state = await loadState();
            state.sessionCount += 1;

            const hoursSinceLast = (Date.now() - state.lastShownAt) / 3_600_000;
            const shouldShow = state.sessionCount >= MIN_SESSION_GAP && hoursSinceLast >= COOLDOWN_HOURS;

            if (shouldShow) {
                // Alternate between rate and follow_x
                const next: PromoKind = state.lastKind === 'rate' ? 'follow_x' : 'rate';
                state.lastKind = next;
                state.lastShownAt = Date.now();
                state.sessionCount = 0;

                setKind(next);

                // Delay before showing to let the user settle in
                timer = setTimeout(() => {
                    show();
                    // Auto-dismiss
                    setTimeout(dismiss, AUTO_DISMISS_MS);
                }, 4000);
            }

            await saveState(state);
        })();

        return () => clearTimeout(timer);
    }, []);

    const handleAction = async () => {
        const url = kind === 'rate' ? RATE_LINK : X_LINK;
        try { await Linking.openURL(url); } catch { /* silently ignore */ }
        dismiss();
    };

    if (!visible || !kind) return null;

    const isRate = kind === 'rate';
    const title = isRate ? 'Enjoying NextVibe?' : 'Follow us on 𝕏';
    const subtitle = isRate
        ? 'Rate us on the dApp Store — it really helps!'
        : 'Stay tuned for updates, drops & alpha.';
    const btnLabel = isRate ? 'Rate Now' : 'Follow';
    const IconComponent = isRate ? Star : Twitter;
    const gradientColors: readonly [string, string] = isRate
        ? ['rgba(168,85,247,0.45)', 'rgba(82,5,159,0.55)']
        : ['rgba(5,240,216,0.25)', 'rgba(0,100,90,0.45)'];
    const accentColor = isRate ? '#c084fc' : '#05f0d8';

    return (
        <Animated.View
            style={[styles.wrapper, { transform: [{ translateY }], opacity }]}
            {...panResponder.panHandlers}
        >
            <LinearGradient
                colors={['rgba(18,9,31,0.97)', 'rgba(10,4,16,0.99)']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            {/* Accent glow stripe */}
            <LinearGradient
                colors={gradientColors}
                style={styles.glowStripe}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            />

            <View style={styles.content}>
                <View style={[styles.iconCircle, { borderColor: accentColor }]}>
                    <IconComponent
                        size={18}
                        color={accentColor}
                        fill={isRate ? accentColor : 'transparent'}
                        strokeWidth={isRate ? 0 : 2}
                    />
                </View>

                <View style={styles.textCol}>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
                </View>

                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: accentColor }]}
                    activeOpacity={0.8}
                    onPress={handleAction}
                >
                    <Text style={styles.actionText}>{btnLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.closeBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={dismiss}
                >
                    <X size={14} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 90,
        left: 16,
        right: 16,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.18)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 18,
        zIndex: 999,
    },
    glowStripe: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 12,
    },
    iconCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textCol: {
        flex: 1,
        gap: 2,
    },
    title: {
        color: '#FFFFFF',
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.45)',
        fontFamily: 'Dank Mono',
        fontSize: 11.5,
        lineHeight: 16,
        includeFontPadding: false,
    },
    actionBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    actionText: {
        color: '#000',
        fontFamily: 'Dank Mono Bold',
        fontSize: 12,
        includeFontPadding: false,
    },
    closeBtn: {
        padding: 4,
    },
});
