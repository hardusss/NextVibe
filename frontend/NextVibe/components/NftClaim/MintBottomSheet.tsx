import React, { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Animated,
    Modal, Dimensions, KeyboardAvoidingView,
    Platform, Vibration, ActivityIndicator,
} from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ImageIcon, CheckCircle, AlertCircle, X, ChevronRight, Handshake } from 'lucide-react-native';
import ButtonWallet from '../ProfilePage/ButtonWallet';
import { CollectInfo } from '@/src/api/collect';
import { useCollectFlow, CollectError, CollectResult } from './useCollectFlow';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;
const DRAG_THRESHOLD = 80;
const SWIPE_KNOB_SIZE = 54;
const SWIPE_TRACK_WIDTH = SCREEN_WIDTH - 48;
const SWIPE_MAX = SWIPE_TRACK_WIDTH - SWIPE_KNOB_SIZE - 8;
const SWIPE_TRIGGER = SWIPE_MAX * 0.85;
const SUCCESS_CLOSE_DELAY = 4000;
/** First edition a non-IRL collector can get while the reservation window is open. */
const FIRST_OPEN_EDITION = 12;

export interface MintBottomSheetRef {
    present: () => void;
    dismiss: () => void;
}

export interface MintBottomSheetProps {
    postId: number;
    imageUrl: string | null;
    creatorUsername: string;
    walletConnected: boolean;
    /**
     * True if the current user is the post owner publishing the drop.
     * False if they are collecting it for free.
     */
    isOwner: boolean;
    /** Per-post collect state from the backend (`collect` object). */
    collect: CollectInfo | null;
    /** Called once the mint is confirmed on-chain. */
    onCollected: (result: CollectResult) => void;
    page: string;
    isFocused?: boolean;
    useModal?: boolean;
}

const errorCopy = (error: CollectError, total: number): string => {
    switch (error.code) {
        case 'DAILY_LIMIT': {
            const time = error.resetsAt
                ? ` at ${new Date(error.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : '';
            return `You've collected 10 posts today. Back tomorrow${time}.`;
        }
        case 'SOLD_OUT':
            return `All ${total} editions are gone.`;
        case 'RESERVED_FOR_IRL':
            return `Early editions are for people who met the author IRL. Try again from #${FIRST_OPEN_EDITION}.`;
        case 'CLAIM_EXPIRED':
            return 'Took too long — swipe again.';
        default:
            return "Couldn't collect. Try again.";
    }
};

const MintBottomSheet = forwardRef<MintBottomSheetRef, MintBottomSheetProps>((props, ref) => {
    const isDark = useColorScheme() === 'dark';

    const c = {
        bg: isDark ? '#0a0114' : '#ffffff',
        card: isDark ? 'rgba(255,255,255,0.03)' : '#f8f9fa',
        text: isDark ? '#f0e6ff' : '#0f172a',
        sub: isDark ? '#8b7aab' : '#64748b',
        handle: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        accent: '#a855f7',
        accentDim: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.08)',
        border: isDark ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.15)',
        errorBg: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
        errorText: isDark ? '#fca5a5' : '#ef4444',
        successBg: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.08)',
        successText: isDark ? '#86efac' : '#22c55e',
        backdrop: 'rgba(0,0,0,0.75)',
        swipeTrack: isDark ? 'rgba(168,85,247,0.08)' : '#f3e8ff',
        swipeBorder: isDark ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.25)',
    };

    const [visible, setVisible] = useState(false);
    const { status, error, result, run, reset } = useCollectFlow(props.postId, props.isOwner);

    const info: CollectInfo = props.collect ?? {
        minted: 0, total: 50, claimedByMe: false, irlEligible: false, reservedEditionsActive: false,
    };
    const total = info.total;
    const editionsLeft = Math.max(0, total - info.minted);
    const showIrlNote = !props.isOwner && info.reservedEditionsActive && !info.irlEligible;

    const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const dragY = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;
    const shakeX = useRef(new Animated.Value(0)).current;
    const arrowAnim = useRef(new Animated.Value(0)).current;
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const swipeX = useSharedValue(0);
    const swipeTriggered = useSharedValue(false);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(arrowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(arrowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    useEffect(() => {
        return () => {
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };
    }, []);

    const startPulse = () => {
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
        );
        pulseLoop.current.start();
    };

    const stopPulse = () => {
        pulseLoop.current?.stop();
        pulseAnim.setValue(1);
    };

    const playSuccess = () => {
        Vibration.vibrate([0, 40, 60, 80]);
        Animated.parallel([
            Animated.spring(successScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
            Animated.timing(successOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]).start();
    };

    const playError = () => {
        Vibration.vibrate([0, 30, 50, 30]);
        Animated.sequence([
            Animated.timing(shakeX, { toValue: -10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -7, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 7, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
    };

    const resetSwipe = () => {
        swipeTriggered.value = false;
        swipeX.value = withSpring(0, { damping: 15 });
    };

    const openSheet = () => {
        setVisible(true);
        reset();
        swipeX.value = 0;
        swipeTriggered.value = false;
        successScale.setValue(0);
        successOpacity.setValue(0);
        translateY.setValue(SHEET_HEIGHT);
        backdropOpacity.setValue(0);
        Animated.parallel([
            Animated.spring(translateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
    };

    const closeSheet = useCallback((onDone?: () => void) => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 300, useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 0, duration: 230, useNativeDriver: true }),
        ]).start(() => {
            setVisible(false);
            dragY.setValue(0);
            onDone?.();
        });
    }, []);

    const isBusy = status === 'preparing' || status === 'signing' || status === 'minting';

    const handleDismiss = useCallback(() => {
        if (isBusy) return;
        closeSheet(() => {
            reset();
            resetSwipe();
            stopPulse();
        });
    }, [isBusy]);

    useImperativeHandle(ref, () => ({
        present: openSheet,
        dismiss: handleDismiss,
    }));

    const sheetDragResponder = useRef(
        require('react-native').PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_: any, g: any) => Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 4,
            onPanResponderMove: (_: any, g: any) => { if (g.dy > 0) dragY.setValue(g.dy); },
            onPanResponderRelease: (_: any, g: any) => {
                if (g.dy > DRAG_THRESHOLD) {
                    handleDismiss();
                } else {
                    Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
                }
            },
        })
    ).current;

    const canCollect = props.walletConnected
        && status === 'idle'
        && !info.claimedByMe
        && (props.isOwner || editionsLeft > 0);

    const executeCollect = async () => {
        if (!canCollect) { resetSwipe(); return; }
        startPulse();
        const outcome = await run();
        stopPulse();
        if (outcome.kind === 'success') {
            playSuccess();
            props.onCollected(outcome.result);
            successTimerRef.current = setTimeout(() => {
                closeSheet(() => {
                    reset();
                    resetSwipe();
                });
            }, SUCCESS_CLOSE_DELAY);
        } else {
            resetSwipe();
            if (outcome.kind === 'error') playError();
        }
    };

    const panGesture = Gesture.Pan()
        .hitSlop({ top: 15, bottom: 15, left: 10, right: 10 })
        .onBegin(() => {
            if (!canCollect) return;
            runOnJS(Vibration.vibrate)(8);
        })
        .onUpdate((e) => {
            if (swipeTriggered.value || !canCollect) return;
            swipeX.value = Math.max(0, Math.min(e.translationX, SWIPE_MAX));
            if (swipeX.value >= SWIPE_TRIGGER) {
                swipeTriggered.value = true;
                swipeX.value = withSpring(SWIPE_MAX, { damping: 12 });
                runOnJS(Vibration.vibrate)(25);
                runOnJS(executeCollect)();
            }
        })
        .onEnd(() => {
            if (!swipeTriggered.value) {
                swipeX.value = withSpring(0, { damping: 15 });
            }
        });

    const knobAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: swipeX.value }],
    }));

    const fillAnimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(swipeX.value, [0, SWIPE_MAX], [0, 1], Extrapolation.CLAMP),
    }));

    const labelAnimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(swipeX.value, [0, SWIPE_MAX * 0.35], [1, 0], Extrapolation.CLAMP),
    }));

    const arrowOpacity1 = arrowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.9, 0.2] });
    const arrowOpacity2 = arrowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.5, 0.1] });

    const isCollector = !props.isOwner;
    const resultEdition = result?.edition ?? info.minted + 1;
    const resultTotal = result?.totalSupply ?? total;

    const headerTitle = () => {
        if (status === 'success') {
            return isCollector ? `Collected · edition ${resultEdition}/${resultTotal}` : 'Published! 🎉';
        }
        return isCollector ? 'Collect this post' : 'Publish as cNFT';
    };

    const headerSubtitle = () => {
        if (status === 'success') return 'cNFT minted to your wallet';
        if (isBusy) return isCollector ? 'Minting on Solana...' : 'Publishing to Solana...';
        return isCollector
            ? '≈ free (network fee only)'
            : 'Others can collect it for free (network fee only)';
    };

    const busyLabel = () => {
        if (status === 'preparing') return 'Preparing…';
        if (status === 'signing') return 'Confirm in your wallet';
        return isCollector ? 'Minting on Solana…' : 'Publishing…';
    };

    const swipeLabel = () => {
        if (!props.walletConnected) return 'Connect wallet first';
        if (info.claimedByMe) return 'Already collected';
        if (isCollector && editionsLeft <= 0) return 'All editions are gone';
        return isCollector ? 'Swipe to collect' : 'Swipe to publish';
    };

    if (!visible) return null;

    const content = (
        <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity, backgroundColor: c.backdrop }]}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleDismiss} activeOpacity={1} />
            </Animated.View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView} pointerEvents="box-none">
                <Animated.View style={[
                    styles.sheet,
                    { backgroundColor: c.bg, transform: [{ translateY: Animated.add(translateY, dragY) }] },
                ]}>

                        <View style={styles.handleArea} {...sheetDragResponder.panHandlers}>
                            <View style={[styles.handle, { backgroundColor: c.handle }]} />
                        </View>

                        {/* Header */}
                        <View style={styles.headerRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.title, { color: c.text }]}>{headerTitle()}</Text>
                                <Text style={[styles.subtitle, { color: c.sub }]}>{headerSubtitle()}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleDismiss}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                style={[styles.closeBtn, { backgroundColor: c.card, borderColor: c.border }]}
                                disabled={isBusy}
                            >
                                <X size={16} color={c.sub} />
                            </TouchableOpacity>
                        </View>

                        {/* Post preview */}
                        <View style={[styles.previewCard, { backgroundColor: c.card }]}>
                            {props.imageUrl ? (
                                <Image source={{ uri: props.imageUrl }} style={styles.postThumb} contentFit="cover" />
                            ) : (
                                <View style={[styles.postThumb, { backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' }]}>
                                    <ImageIcon size={22} color={c.accent} />
                                </View>
                            )}
                            <View style={styles.previewInfo}>
                                <Text style={[styles.postLabel, { color: c.sub }]}>
                                    {isCollector ? 'Collecting from' : 'Publishing'}
                                </Text>
                                <Text style={[styles.postCreator, { color: c.text }]}>@{props.creatorUsername}</Text>
                            </View>
                            <View style={[styles.editionBadge, { backgroundColor: c.accentDim }]}>
                                <Text style={[styles.editionBadgeText, { color: c.accent }]}>
                                    {status === 'success' ? `#${resultEdition} / ${resultTotal}` : `${editionsLeft} / ${total} left`}
                                </Text>
                            </View>
                        </View>

                        {/* IRL reservation note */}
                        {showIrlNote && status !== 'success' && (
                            <View style={styles.irlNoteRow}>
                                <Handshake size={14} color={c.sub} />
                                <Text style={[styles.irlNoteText, { color: c.sub }]}>
                                    Early editions are reserved for people who met the author IRL — you can still collect from #{FIRST_OPEN_EDITION}
                                </Text>
                            </View>
                        )}

                        {!props.walletConnected && (
                            <ButtonWallet widthButton={"100%"} page={props.page}/>
                        )}

                        {status === 'error' && !!error && (
                            <Animated.View style={[styles.alertCard, { backgroundColor: c.errorBg, transform: [{ translateX: shakeX }] }]}>
                                <AlertCircle size={15} color={c.errorText} />
                                <Text style={[styles.alertText, { color: c.errorText }]} numberOfLines={2}>
                                    {errorCopy(error, total)}
                                </Text>
                            </Animated.View>
                        )}

                        <View style={{ flex: 1 }} />

                        {/* Swipe button */}
                        {status !== 'success' && (
                            <Animated.View style={{ opacity: isBusy ? pulseAnim : 1 }}>
                                <View style={[
                                    styles.swipeTrack,
                                    {
                                        backgroundColor: c.swipeTrack,
                                        borderColor: canCollect ? c.swipeBorder : c.card,
                                        opacity: canCollect || isBusy ? 1 : 0.5,
                                    }
                                ]}>
                                    <Reanimated.View style={[styles.swipeFill, fillAnimStyle]} pointerEvents="none">
                                        <LinearGradient
                                            colors={['rgba(168,85,247,0.4)', 'rgba(109,40,217,0.15)']}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={StyleSheet.absoluteFillObject}
                                        />
                                    </Reanimated.View>

                                    <Reanimated.View style={[styles.swipeLabelRow, labelAnimStyle]} pointerEvents="none">
                                        {isBusy ? (
                                            <Text style={[styles.swipeLabel, { color: c.accent, fontFamily: 'Dank Mono Bold' }]}>
                                                {busyLabel()}
                                            </Text>
                                        ) : (
                                            <>
                                                <Text style={[styles.swipeLabel, { color: c.sub }]}>{swipeLabel()}</Text>
                                                {canCollect && (
                                                    <>
                                                        <Animated.View style={{ opacity: arrowOpacity1 }}>
                                                            <ChevronRight size={18} color={c.accent} />
                                                        </Animated.View>
                                                        <Animated.View style={{ opacity: arrowOpacity2 }}>
                                                            <ChevronRight size={18} color={c.accent} />
                                                        </Animated.View>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </Reanimated.View>

                                    <GestureDetector gesture={panGesture}>
                                        <Reanimated.View style={[styles.swipeKnob, knobAnimStyle]}>
                                            <LinearGradient
                                                colors={isBusy ? ['#6d28d9', '#4c1d95'] : ['#a855f7', '#7c3aed']}
                                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                style={styles.knobGradient}
                                            >
                                                {isBusy
                                                    ? <ActivityIndicator color="white" size="small" />
                                                    : <ChevronRight size={24} color="white" strokeWidth={2.5} />
                                                }
                                            </LinearGradient>
                                        </Reanimated.View>
                                    </GestureDetector>
                                </View>
                            </Animated.View>
                        )}

                        {/* Success banner */}
                        {status === 'success' && (
                            <Animated.View style={[
                                styles.successBanner,
                                { backgroundColor: c.successBg, transform: [{ scale: successScale }], opacity: successOpacity }
                            ]}>
                                <CheckCircle size={28} color={c.successText} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.successTitle, { color: c.successText }]}>
                                        {isCollector ? `Collected · edition ${resultEdition}/${resultTotal}` : 'Published!'}
                                    </Text>
                                    <Text style={[styles.successSub, { color: c.successText, opacity: 0.8 }]}>
                                        {isCollector ? 'cNFT is in your wallet' : 'Others can now collect your post for free'}
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                    </Animated.View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
    );

    if (props.useModal === false) {
        return content;
    }

    return (
        <Modal
            visible={visible && (props.isFocused ?? true)}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            {content}
        </Modal>
    );
});

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject },
    keyboardView: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
        height: SHEET_HEIGHT,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    handleArea: { alignItems: 'center', paddingVertical: 16 },
    handle: { width: 44, height: 5, borderRadius: 2.5 },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        marginBottom: 4,
        letterSpacing: -0.5,
    },
    subtitle: { fontSize: 13, fontFamily: 'Dank Mono', includeFontPadding: false },
    previewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        padding: 14,
        marginBottom: 14,
        gap: 14,
    },
    postThumb: { width: 56, height: 56, borderRadius: 14 },
    previewInfo: { flex: 1, gap: 4 },
    postLabel: { fontSize: 12, fontFamily: 'Dank Mono', includeFontPadding: false },
    postCreator: { fontSize: 16, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    editionBadge: {
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    editionBadgeText: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    irlNoteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 4,
        marginBottom: 14,
    },
    irlNoteText: { fontSize: 12, fontFamily: 'Dank Mono', includeFontPadding: false, flex: 1 },
    alertCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
        marginBottom: 10,
    },
    alertText: { fontSize: 14, fontFamily: 'Dank Mono', includeFontPadding: false, flex: 1 },
    swipeTrack: {
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
    swipeFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: (SWIPE_KNOB_SIZE + 10) / 2,
    },
    swipeLabelRow: {
        position: 'absolute',
        left: SWIPE_KNOB_SIZE + 20,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    swipeLabel: { fontSize: 14, fontFamily: 'Dank Mono', includeFontPadding: false, flex: 1 },
    swipeKnob: {
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
    successBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 20,
        gap: 16,
    },
    successTitle: { fontSize: 18, fontFamily: 'Dank Mono Bold', includeFontPadding: false, marginBottom: 4 },
    successSub: { fontSize: 13, fontFamily: 'Dank Mono', includeFontPadding: false },
});

export default MintBottomSheet;
