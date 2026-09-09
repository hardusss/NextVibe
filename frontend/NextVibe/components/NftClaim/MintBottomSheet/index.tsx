import React, { useCallback, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Linking,
    Modal, Dimensions, Platform, KeyboardAvoidingView,
} from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    runOnJS,
    useReducedMotion,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import ButtonWallet from '../../ProfilePage/ButtonWallet';
import { CollectInfo } from '@/src/api/collect';
import { useCollectFlow, CollectError, CollectResult } from './useCollectFlow';
import HeroCard from './HeroCard';
import EditionStrip from './EditionStrip';
import SwipeToCollect, { SwipeToCollectRef } from './SwipeToCollect';
import SuccessBurst from './SuccessBurst';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.8;
const DRAG_THRESHOLD = 80;
const SUCCESS_CLOSE_DELAY = 4000;
/** First edition a non-IRL collector can get while the reservation window is open. */
const FIRST_OPEN_EDITION = 12;
const IRL_RESERVED_COUNT = 10;

export interface MintBottomSheetRef {
    present: () => void;
    dismiss: () => void;
}

export interface MintBottomSheetProps {
    postId: number;
    imageUrl: string | null;
    creatorUsername: string;
    creatorAvatar?: string | null;
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
    const reduceMotion = useReducedMotion();

    const c = {
        bg: isDark ? '#0a0114' : '#ffffff',
        card: isDark ? 'rgba(255,255,255,0.03)' : '#f8f9fa',
        text: isDark ? '#f0e6ff' : '#0f172a',
        sub: isDark ? '#8b7aab' : '#64748b',
        handle: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        accent: '#a855f7',
        accentDim: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.08)',
        border: isDark ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.15)',
        errorText: isDark ? '#fca5a5' : '#ef4444',
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
    const reservedForOthers = !props.isOwner && info.reservedEditionsActive && !info.irlEligible;
    const upcomingEdition = props.isOwner
        ? info.minted + 1
        : reservedForOthers && info.minted + 1 < FIRST_OPEN_EDITION
            ? FIRST_OPEN_EDITION
            : info.minted + 1;

    const translateY = useSharedValue(SHEET_HEIGHT);
    const backdropOpacity = useSharedValue(0);
    const dragY = useSharedValue(0);
    const shakeX = useSharedValue(0);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const swipeRef = useRef<SwipeToCollectRef>(null);

    const isBusy = status === 'preparing' || status === 'signing' || status === 'minting';

    const clearSuccessTimer = () => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
    };

    const closeSheet = useCallback((onDone?: () => void) => {
        backdropOpacity.value = withTiming(0, { duration: 230 });
        translateY.value = withTiming(SHEET_HEIGHT, { duration: 300 }, (finished) => {
            if (finished) {
                runOnJS(setVisible)(false);
                dragY.value = 0;
                if (onDone) runOnJS(onDone)();
            }
        });
    }, [backdropOpacity, translateY, dragY]);

    const handleDismiss = useCallback(() => {
        if (isBusy) return;
        clearSuccessTimer();
        closeSheet(() => {
            reset();
            swipeRef.current?.reset();
        });
    }, [isBusy, closeSheet, reset]);

    const playError = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shakeX.value = withSequence(
            withTiming(-10, { duration: 55 }),
            withTiming(10, { duration: 55 }),
            withTiming(-7, { duration: 55 }),
            withTiming(7, { duration: 55 }),
            withTiming(0, { duration: 55 }),
        );
    };

    const openSheet = () => {
        setVisible(true);
        reset();
        translateY.value = SHEET_HEIGHT;
        backdropOpacity.value = 0;
        dragY.value = 0;
        translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
        backdropOpacity.value = withTiming(1, { duration: 250 });
    };

    useImperativeHandle(ref, () => ({
        present: openSheet,
        dismiss: handleDismiss,
    }));

    const sheetPan = Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-14, 14])
        .onUpdate((e) => {
            'worklet';
            if (e.translationY > 0) {
                dragY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            'worklet';
            if (e.translationY > DRAG_THRESHOLD || e.velocityY > 500) {
                runOnJS(handleDismiss)();
            } else {
                dragY.value = withSpring(0, { damping: 18 });
            }
        });

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value + dragY.value }],
    }));

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    const canCollect = props.walletConnected
        && status === 'idle'
        && !info.claimedByMe
        && (props.isOwner || editionsLeft > 0);

    const executeCollect = async () => {
        if (!canCollect) { swipeRef.current?.reset(); return; }
        const outcome = await run();
        if (outcome.kind === 'success') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            props.onCollected(outcome.result);
            successTimerRef.current = setTimeout(() => {
                closeSheet(() => {
                    reset();
                    swipeRef.current?.reset();
                });
            }, SUCCESS_CLOSE_DELAY);
        } else {
            swipeRef.current?.reset();
            if (outcome.kind === 'error') playError();
        }
    };

    const handleViewInWallet = async () => {
        clearSuccessTimer();
        const schemes = ['solflare://', 'phantom://'];
        for (const scheme of schemes) {
            try {
                await Linking.openURL(scheme);
                return;
            } catch { /* try next */ }
        }
        handleDismiss();
        router.push('/profile');
    };

    const isCollector = !props.isOwner;
    const resultEdition = result?.edition ?? upcomingEdition;
    const resultTotal = result?.totalSupply ?? total;

    const headerTitle = () => {
        if (status === 'success') {
            return isCollector ? `Collected · edition ${resultEdition}/${resultTotal}` : 'Published!';
        }
        return isCollector ? 'Collect this post' : 'Publish as cNFT';
    };

    const headerSubtitle = () => {
        if (status === 'success') return 'cNFT is in your wallet';
        if (status === 'signing') return 'Confirm in your wallet';
        if (isBusy) return isCollector ? 'Minting on Solana…' : 'Publishing to Solana…';
        return '≈ free · network fee only';
    };

    const busyLabel = () => {
        if (status === 'preparing') return 'Preparing…';
        if (status === 'signing') return 'Confirm in your wallet';
        return isCollector ? 'Minting on Solana…' : 'Publishing to Solana…';
    };

    const swipeLabel = () => {
        if (info.claimedByMe) return 'Already collected';
        if (isCollector && editionsLeft <= 0) return 'All editions are gone';
        return isCollector ? 'Swipe to collect' : 'Swipe to publish';
    };

    const pills: string[] = isCollector
        ? [
            'cNFT in your wallet',
            `Edition #${status === 'success' ? resultEdition : upcomingEdition} of ${total}`,
            ...(info.irlEligible ? ['+2 rep · met IRL'] : []),
        ]
        : [
            'cNFT in your wallet',
            'Others collect for free',
            `${total} editions`,
        ];

    if (!visible) return null;

    const content = (
        <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
            <Reanimated.View style={[styles.backdrop, backdropAnimatedStyle, { backgroundColor: c.backdrop }]}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleDismiss} activeOpacity={1} />
            </Reanimated.View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView} pointerEvents="box-none">
                <Reanimated.View
                    style={[
                        styles.sheet,
                        sheetAnimatedStyle,
                        { backgroundColor: c.bg },
                    ]}
                    onTouchStart={() => { if (status === 'success') clearSuccessTimer(); }}
                >
                    <GestureDetector gesture={sheetPan}>
                        <View style={styles.handleArea}>
                            <View style={[styles.handle, { backgroundColor: c.handle }]} />
                        </View>
                    </GestureDetector>

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

                    {/* Content dims while the wallet prompt is open */}
                    <View style={[styles.content, status === 'signing' && { opacity: 0.6 }]}>
                        <View>
                            <HeroCard
                                imageUrl={props.imageUrl}
                                creatorUsername={props.creatorUsername}
                                creatorAvatar={props.creatorAvatar}
                                edition={status === 'success' ? resultEdition : upcomingEdition}
                                total={total}
                                flipped={status === 'minting'}
                                success={status === 'success'}
                                reduceMotion={!!reduceMotion}
                                colors={c}
                            />
                            {!reduceMotion && <SuccessBurst trigger={status === 'success'} color={c.accent} />}
                        </View>

                        <EditionStrip
                            total={total}
                            minted={info.minted}
                            reservedForOthers={reservedForOthers}
                            reservedCount={IRL_RESERVED_COUNT}
                            firstOpenEdition={FIRST_OPEN_EDITION}
                            reduceMotion={!!reduceMotion}
                            colors={c}
                        />

                        {/* What you get */}
                        <View style={styles.pillRow}>
                            {pills.map((pill) => (
                                <View key={pill} style={[styles.pill, { backgroundColor: c.accentDim, borderColor: c.border }]}>
                                    <Text style={[styles.pillText, { color: c.text }]}>{pill}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={{ flex: 1 }} />

                    {/* Footer: wallet connect / swipe track / success actions */}
                    {!props.walletConnected ? (
                        <ButtonWallet widthButton={"100%"} page={props.page} />
                    ) : status === 'success' ? (
                        <View style={styles.successActions}>
                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: c.accent }]}
                                onPress={handleViewInWallet}
                            >
                                <Text style={styles.primaryBtnText}>View in wallet</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.secondaryBtn, { borderColor: c.border }]}
                                onPress={handleDismiss}
                            >
                                <Text style={[styles.secondaryBtnText, { color: c.sub }]}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <SwipeToCollect
                            ref={swipeRef}
                            label={swipeLabel()}
                            releaseLabel={isCollector ? 'Release to collect' : 'Release to publish'}
                            busyLabel={busyLabel()}
                            busy={isBusy}
                            enabled={canCollect}
                            errorMessage={status === 'error' && error ? errorCopy(error, total) : null}
                            shakeX={shakeX}
                            onTrigger={executeCollect}
                            colors={c}
                        />
                    )}

                </Reanimated.View>
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
        marginBottom: 16,
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
        fontSize: 22,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        marginBottom: 4,
        letterSpacing: -0.5,
    },
    subtitle: { fontSize: 13, fontFamily: 'Dank Mono', includeFontPadding: false },
    content: {},
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    pill: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pillText: {
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    successActions: {
        gap: 10,
    },
    primaryBtn: {
        borderRadius: 18,
        paddingVertical: 15,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: 'white',
        fontSize: 15,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    secondaryBtn: {
        borderRadius: 18,
        borderWidth: 1,
        paddingVertical: 13,
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
});

export default MintBottomSheet;
