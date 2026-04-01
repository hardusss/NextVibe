import React, { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Animated, TextInput,
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
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ImageIcon, CheckCircle, AlertCircle, X, ChevronRight, Tag, Coins } from 'lucide-react-native';
import ButtonWallet from '../ProfilePage/ButtonWallet';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;
const DRAG_THRESHOLD = 80;
const SWIPE_KNOB_SIZE = 54;
const SWIPE_TRACK_WIDTH = SCREEN_WIDTH - 48;
const SWIPE_MAX = SWIPE_TRACK_WIDTH - SWIPE_KNOB_SIZE - 8;
const SWIPE_TRIGGER = SWIPE_MAX * 0.85;
const SUCCESS_CLOSE_DELAY = 2200;

export interface MintBottomSheetRef {
    present: () => void;
    dismiss: () => void;
}

export interface MintBottomSheetProps {
    postId: number;
    imageUrl: string | null;
    creatorUsername: string;
    walletConnected: boolean;
    onMint: (postId: number, price: number) => Promise<void>;
    /**
     * True if the current user is the post owner setting up the NFT drop.
     * False if they are a collector paying the fixed price.
     */
    isOwner: boolean;
    /**
     * Pre-filled price from the server (edition #1 price).
     * Shown as read-only for collectors. Null for first-time owner setup.
     */
    defaultPrice: string | null;
    page: string;
}

type MintStatus = 'idle' | 'minting' | 'success' | 'error';

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
        borderFocus: '#a855f7',
        errorBg: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
        errorText: isDark ? '#fca5a5' : '#ef4444',
        successBg: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.08)',
        successText: isDark ? '#86efac' : '#22c55e',
        warnBg: isDark ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.08)',
        warnText: isDark ? '#fde047' : '#d97706',
        backdrop: 'rgba(0,0,0,0.75)',
        swipeTrack: isDark ? 'rgba(168,85,247,0.08)' : '#f3e8ff',
        swipeBorder: isDark ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.25)',
        priceLocked: isDark ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.05)',
    };

    const [visible, setVisible] = useState(false);
    const [status, setStatus] = useState<MintStatus>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [priceInput, setPriceInput] = useState('');
    const [inputFocused, setInputFocused] = useState(false);

    const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const dragY = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
    const successScale = useRef(new Animated.Value(0)).current;
    const successOpacity = useRef(new Animated.Value(0)).current;
    const shakeX = useRef(new Animated.Value(0)).current;
    const arrowAnim = useRef(new Animated.Value(0)).current;

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
        // Pre-fill price for collectors from server data
        const initialPrice = !props.isOwner && props.defaultPrice ? props.defaultPrice : '';
        setPriceInput(initialPrice);

        setVisible(true);
        setStatus('idle');
        setErrorMsg('');
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

    const handleDismiss = useCallback(() => {
        if (status === 'minting') return;
        closeSheet(() => {
            setStatus('idle');
            setErrorMsg('');
            setPriceInput('');
            resetSwipe();
            stopPulse();
        });
    }, [status]);

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

    const price = parseFloat(priceInput) || 0;
    const royalty = +(price * 0.05).toFixed(6);
    const youReceive = +(price - royalty).toFixed(6);
    const isValidPrice = price > 0;
    const canMint = props.walletConnected && isValidPrice && status === 'idle';

    const handlePriceChange = (raw: string) => {
        // Collectors cannot change the price
        if (!props.isOwner) return;
        let cleaned = raw.replace(/[^0-9.]/g, '');
        const parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        if (parts[1] && parts[1].length > 6) cleaned = parts[0] + '.' + parts[1].slice(0, 6);
        if (cleaned.length > 1 && cleaned[0] === '0' && cleaned[1] !== '.') {
            cleaned = cleaned.replace(/^0+/, '');
        }
        setPriceInput(cleaned);
        if (status === 'error') { setStatus('idle'); setErrorMsg(''); }
    };

    const executeMint = async () => {
        if (!canMint) { resetSwipe(); return; }
        setStatus('minting');
        setErrorMsg('');
        startPulse();
        try {
            await props.onMint(props.postId, price);
            stopPulse();
            setStatus('success');
            playSuccess();
            setTimeout(() => {
                closeSheet(() => {
                    setStatus('idle');
                    setErrorMsg('');
                    setPriceInput('');
                    resetSwipe();
                });
            }, SUCCESS_CLOSE_DELAY);
        } catch (e: any) {
            stopPulse();
            setStatus('error');
            resetSwipe();
            const msg = e?.response?.data?.error || e?.message || 'Transaction failed';
            setErrorMsg(msg);
            playError();
        }
    };

    const panGesture = Gesture.Pan()
        .hitSlop({ top: 15, bottom: 15, left: 10, right: 10 })
        .onBegin(() => {
            if (!canMint) return;
            runOnJS(Vibration.vibrate)(8);
        })
        .onUpdate((e) => {
            if (swipeTriggered.value || !canMint) return;
            swipeX.value = Math.max(0, Math.min(e.translationX, SWIPE_MAX));
            if (swipeX.value >= SWIPE_TRIGGER) {
                swipeTriggered.value = true;
                swipeX.value = withSpring(SWIPE_MAX, { damping: 12 });
                runOnJS(Vibration.vibrate)(25);
                runOnJS(executeMint)();
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

    // Derived display values
    const isCollector = !props.isOwner;

    const headerTitle = () => {
        if (status === 'success') return isCollector ? 'Collected! 🎉' : 'Drop Created! 🎉';
        return isCollector ? 'Collect Post' : 'Monetize Post';
    };

    const headerSubtitle = () => {
        if (status === 'success') return isCollector ? 'cNFT minted to your wallet' : 'Users can now collect your post';
        if (status === 'minting') return isCollector ? 'Minting on Solana...' : 'Publishing to Solana...';
        return isCollector
            ? `Pay ${props.defaultPrice ?? '—'} SOL to mint this post as a cNFT`
            : 'Set the price for others to collect';
    };

    const swipeLabel = () => {
        if (!props.walletConnected) return 'Connect wallet first';
        if (!isValidPrice) return isCollector ? 'Price not set yet' : 'Enter price to continue';
        return isCollector
            ? `Swipe to pay · ${price} SOL`
            : `Swipe to set price · ${price} SOL`;
    };

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleDismiss}>
            <GestureHandlerRootView style={{ flex: 1 }}>
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
                                disabled={status === 'minting'}
                            >
                                <X size={16} color={c.sub} />
                            </TouchableOpacity>
                        </View>

                        {/* Post preview */}
                        <View style={[styles.previewCard, { backgroundColor: c.card }]}>
                            {props.imageUrl ? (
                                <FastImage source={{ uri: props.imageUrl }} style={styles.postThumb} resizeMode={FastImage.resizeMode.cover} />
                            ) : (
                                <View style={[styles.postThumb, { backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' }]}>
                                    <ImageIcon size={22} color={c.accent} />
                                </View>
                            )}
                            <View style={styles.previewInfo}>
                                <Text style={[styles.postLabel, { color: c.sub }]}>
                                    {isCollector ? 'Collecting from' : 'Creating drop for'}
                                </Text>
                                <Text style={[styles.postCreator, { color: c.text }]}>@{props.creatorUsername}</Text>
                            </View>
                            {status === 'success' && (
                                <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity }}>
                                    <CheckCircle size={28} color={c.successText} />
                                </Animated.View>
                            )}
                        </View>

                        {/* Price section */}
                        {isCollector ? (
                            // Collector: locked price display
                            <View style={[styles.priceLockedCard, { backgroundColor: c.priceLocked, borderColor: c.border }]}>
                                <View style={styles.priceLockedLeft}>
                                    <Coins size={18} color={c.accent} />
                                    <View>
                                        <Text style={[styles.inputLabel, { color: c.sub }]}>Mint price</Text>
                                        <Text style={[styles.priceLockedValue, { color: c.text }]}>
                                            {props.defaultPrice ?? '—'} SOL
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.lockedBadge, { backgroundColor: c.accentDim }]}>
                                    <Text style={[styles.lockedBadgeText, { color: c.accent }]}>Fixed</Text>
                                </View>
                            </View>
                        ) : (
                            // Owner: editable price input
                            <Animated.View style={[
                                styles.inputCard,
                                {
                                    backgroundColor: inputFocused ? c.accentDim : c.card,
                                    borderColor: inputFocused ? c.borderFocus : 'transparent',
                                    borderWidth: 1,
                                    transform: [{ translateX: shakeX }],
                                }
                            ]}>
                                <View style={styles.inputLabelRow}>
                                    <Tag size={12} color={c.sub} style={{ marginRight: 6 }} />
                                    <Text style={[styles.inputLabel, { color: c.sub }]}>Price for collectors</Text>
                                </View>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        value={priceInput}
                                        onChangeText={handlePriceChange}
                                        onFocus={() => setInputFocused(true)}
                                        onBlur={() => setInputFocused(false)}
                                        placeholder="0.00"
                                        placeholderTextColor={c.sub}
                                        keyboardType="decimal-pad"
                                        style={[styles.input, { color: c.text }]}
                                        editable={status !== 'minting' && status !== 'success'}
                                    />
                                    <View style={[styles.currencyBadge, { backgroundColor: isDark ? '#1e1133' : '#f3e8ff' }]}>
                                        <Text style={[styles.inputCurrency, { color: c.accent }]}>SOL</Text>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Fee breakdown — shown for both owner and collector */}
                        {isValidPrice && status !== 'success' && (
                            <View style={[styles.feeCard, { borderColor: c.border }]}>
                                <View style={styles.feeRow}>
                                    <Text style={[styles.feeLabel, { color: c.text, fontFamily: 'Dank Mono Bold' }]}>
                                        {isCollector ? 'You pay' : 'Your profit per collect'}
                                    </Text>
                                    <Text style={[styles.feeValue, {
                                        color: isCollector ? c.errorText : c.successText,
                                        fontSize: 14,
                                    }]}>
                                        {isCollector ? `${price} SOL` : `+${youReceive} SOL`}
                                    </Text>
                                </View>
                                <View style={[styles.feeDivider, { backgroundColor: c.border }]} />
                                <View style={styles.feeRow}>
                                    <Text style={[styles.feeLabel, { color: c.sub }]}>
                                        {isCollector ? 'Goes to creator' : 'Platform fee (5%)'}
                                    </Text>
                                    <Text style={[styles.feeValue, { color: c.sub }]}>
                                        {isCollector ? `${youReceive} SOL` : `${royalty} SOL`}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {!props.walletConnected && (
                            <ButtonWallet widthButton={"100%"} page={props.page}/>
                        )}

                        {status === 'error' && !!errorMsg && (
                            <Animated.View style={[styles.alertCard, { backgroundColor: c.errorBg, transform: [{ translateX: shakeX }] }]}>
                                <AlertCircle size={15} color={c.errorText} />
                                <Text style={[styles.alertText, { color: c.errorText }]} numberOfLines={2}>{errorMsg}</Text>
                            </Animated.View>
                        )}

                        <View style={{ flex: 1 }} />

                        {/* Swipe button */}
                        {status !== 'success' && (
                            <Animated.View style={{ opacity: status === 'minting' ? pulseAnim : 1 }}>
                                <View style={[
                                    styles.swipeTrack,
                                    {
                                        backgroundColor: c.swipeTrack,
                                        borderColor: canMint ? c.swipeBorder : c.card,
                                        opacity: canMint || status === 'minting' ? 1 : 0.5,
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
                                        {status === 'minting' ? (
                                            <Text style={[styles.swipeLabel, { color: c.accent, fontFamily: 'Dank Mono Bold' }]}>
                                                {isCollector ? 'Minting...' : 'Confirming Drop...'}
                                            </Text>
                                        ) : (
                                            <>
                                                <Text style={[styles.swipeLabel, { color: c.sub }]}>{swipeLabel()}</Text>
                                                {canMint && (
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
                                                colors={status === 'minting' ? ['#6d28d9', '#4c1d95'] : ['#a855f7', '#7c3aed']}
                                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                style={styles.knobGradient}
                                            >
                                                {status === 'minting'
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
                                        {isCollector ? 'NFT minted successfully!' : 'Drop Created!'}
                                    </Text>
                                    <Text style={[styles.successSub, { color: c.successText, opacity: 0.8 }]}>
                                        {isCollector ? 'Check your wallet on Solflare' : 'Users can now collect your post'}
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                    </Animated.View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
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
    // Owner price input
    inputCard: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 16, marginBottom: 14 },
    inputLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    inputLabel: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center' },
    input: { flex: 1, fontSize: 38, fontFamily: 'Dank Mono Bold', includeFontPadding: false, padding: 0 },
    currencyBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
    inputCurrency: { fontSize: 15, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    // Collector locked price
    priceLockedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 14,
    },
    priceLockedLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    priceLockedValue: {
        fontSize: 32,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        marginTop: 2,
    },
    lockedBadge: {
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    lockedBadgeText: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    // Fee breakdown
    feeCard: {
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 14,
        gap: 10,
        borderStyle: 'dashed',
    },
    feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    feeLabel: { fontSize: 13, fontFamily: 'Dank Mono', includeFontPadding: false },
    feeValue: { fontSize: 13, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    feeDivider: { height: 1, opacity: 0.5 },
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