import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Animated, StatusBar, Modal, Platform
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop
} from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Wifi, WifiOff, Users, CheckCircle, AlertTriangle, Link2, Check } from 'lucide-react-native';

import { storage } from '@/src/utils/storage';
import haptics from '@/src/utils/haptics';
import { useProximityBroadcast } from '@/hooks/useProximityBroadcast';
import { useProximityReadiness } from '@/hooks/useProximityReadiness';
import ReadinessCard from '@/components/Proximity/ReadinessCard';

export interface ShareModalRef {
    present: () => void;
    dismiss: () => void;
}

export interface ShareModalProps {
    avatarUrl: string | null;
    profileUrl?: string;
}

const NeonGlowOverlay = ({ opacity }: { opacity: Animated.Value }) => {
    const SIDE = 55;
    const BOTTOM = 70;
    const CORNER = 65;

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            pointerEvents="none"
        >
            <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { opacity }]}
            >
                <LinearGradient
                    colors={[
                        'rgba(124, 58, 237, 0.55)',
                        'rgba(139, 92, 246, 0.18)',
                        'rgba(139, 92, 246, 0)',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[StyleSheet.absoluteFillObject, { right: undefined, width: SIDE }]}
                />

                <LinearGradient
                    colors={[
                        'rgba(139, 92, 246, 0)',
                        'rgba(139, 92, 246, 0.18)',
                        'rgba(124, 58, 237, 0.55)',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[StyleSheet.absoluteFillObject, { left: undefined, width: SIDE }]}
                />

                <LinearGradient
                    colors={[
                        'rgba(109, 40, 217, 0)',
                        'rgba(109, 40, 217, 0.22)',
                        'rgba(91, 33, 182, 0.6)',
                    ]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[StyleSheet.absoluteFillObject, { top: undefined, height: BOTTOM }]}
                />

                <LinearGradient
                    colors={['rgba(139, 92, 246, 0.38)', 'rgba(139, 92, 246, 0)']}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        width: CORNER,
                        height: CORNER,
                    }}
                />

                <LinearGradient
                    colors={['rgba(139, 92, 246, 0)', 'rgba(139, 92, 246, 0.38)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: CORNER,
                        height: CORNER,
                    }}
                />
            </Animated.View>
        </Modal>
    );
};

const ShareModal = forwardRef<ShareModalRef, ShareModalProps>((props, ref) => {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    const colors = isDark ? {
        background: '#0f021c',
        cardBg: 'rgba(255, 255, 255, 0.05)',
        textColor: '#ffffff',
        subText: '#a1a1aa',
        handleColor: '#ffffff',
        accent: '#a855f7',
        iconColor: '#d8b4fe',
        statusBarStyle: 'light-content' as const,
        statusBarBg: '#0A0410',
    } : {
        background: '#ffffff',
        cardBg: 'rgba(0, 0, 0, 0.03)',
        textColor: '#1f2937',
        subText: '#6b7280',
        handleColor: '#e5e7eb',
        accent: '#7c3aed',
        iconColor: '#7c3aed',
        statusBarStyle: 'dark-content' as const,
        statusBarBg: '#ffffff',
    };

    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [vibes, setVibes] = useState(0);
    const [showGlow, setShowGlow] = useState(false);
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    const glowAnimRef = useRef<Animated.CompositeAnimation | null>(null);
    const glowOpacity = useRef(new Animated.Value(0)).current;

    const snapPoints = useMemo(() => ['55%', '75%'], []);

    useEffect(() => {
        StatusBar.setBarStyle(colors.statusBarStyle, true);
        StatusBar.setBackgroundColor(colors.statusBarBg, true);
    }, [isDark]);

    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        };
    }, []);

    useImperativeHandle(ref, () => ({
        present: () => bottomSheetModalRef.current?.present(),
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const resetState = () => {
        setVibes(0);
        setShowGlow(false);
        glowOpacity.setValue(0);
        setCopied(false);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };

    const resolveProfileUrl = async (): Promise<string | null> => {
        let url = props.profileUrl;
        if (!url || url.includes('undefined') || url.includes('NaN')) {
            const storedId = await storage.getItem('id');
            if (storedId) url = `https://nextvibe.io/u/${storedId}`;
        }
        if (!url || url.includes('undefined') || url.includes('NaN')) return null;
        return url;
    };

    const handleCopyLink = async () => {
        try {
            const url = await resolveProfileUrl();
            if (!url) return;
            await Clipboard.setStringAsync(url);
            haptics.notification('success');
            setCopied(true);
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.warn('[ShareModal] Failed to copy profile link:', e);
        }
    };

    const triggerNeonGlow = () => {
        glowAnimRef.current?.stop();
        setShowGlow(true);
        glowOpacity.setValue(0);

        StatusBar.setBarStyle('light-content', true);
        StatusBar.setBackgroundColor('#5b21b6', true);
        setTimeout(() => {
            StatusBar.setBarStyle(colors.statusBarStyle, true);
            StatusBar.setBackgroundColor(colors.statusBarBg, true);
        }, 1000);

        const anim = Animated.sequence([
            Animated.timing(glowOpacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
                toValue: 0,
                duration: 1100,
                delay: 150,
                useNativeDriver: true,
            }),
        ]);

        glowAnimRef.current = anim;
        anim.start(({ finished }) => {
            if (finished) setShowGlow(false);
        });
    };

    // Another phone read the profile (either channel; debounced in the hook).
    const handleReadEvent = () => {
        haptics.impact('rigid');
        setVibes(prev => prev + 1);
        triggerNeonGlow();
    };

    const broadcast = useProximityBroadcast({ onRead: handleReadEvent });
    const isBroadcasting = broadcast.isActive;
    const readiness = useProximityReadiness({
        role: 'share',
        enabled: isOpen,
        onFixed: () => broadcast.restart(),
    });

    const startHceBroadcast = async () => {
        const urlToShare = await resolveProfileUrl();
        if (!urlToShare) {
            console.warn('[ShareModal] Cannot broadcast: no user ID available');
            return;
        }
        await broadcast.start(urlToShare);
    };

    const stopHceBroadcast = () => {
        broadcast.stop();
    };

    const hasStartedRef = useRef(false);
    // The sheet callback is memoized once; always run the latest start (props.profileUrl may arrive later).
    const startRef = useRef(startHceBroadcast);
    startRef.current = startHceBroadcast;

    const handleSheetChanges = useCallback((index: number) => {
        if (index >= 0 && !hasStartedRef.current) {
            hasStartedRef.current = true;
            setIsOpen(true);
            startRef.current();
        } else if (index === -1) {
            hasStartedRef.current = false;
            setIsOpen(false);
            stopHceBroadcast();
            resetState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClose = () => {
        stopHceBroadcast();
        bottomSheetModalRef.current?.dismiss();
    };

    return (
        <>
            {showGlow && <NeonGlowOverlay opacity={glowOpacity} />}

            <BottomSheetModal
                ref={bottomSheetModalRef}
                index={1}
                snapPoints={snapPoints}
                backdropComponent={(bsProps) => (
                    <BottomSheetBackdrop
                        {...bsProps}
                        disappearsOnIndex={-1}
                        appearsOnIndex={0}
                        opacity={0.6}
                    />
                )}
                onChange={handleSheetChanges}
                onDismiss={() => {
                    hasStartedRef.current = false;
                    setIsOpen(false);
                    stopHceBroadcast();
                    resetState();
                }}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: colors.handleColor, width: 40, opacity: 0.5 }}
            >
                <BottomSheetView style={[styles.contentContainer, { backgroundColor: colors.background }]}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color: colors.textColor }]}>
                            {isBroadcasting ? "Sharing your profile" : "Getting ready…"}
                        </Text>
                        {isBroadcasting ? (
                            <Wifi
                                size={20}
                                color={colors.accent}
                                style={{ marginLeft: 8 }}
                            />
                        ) : (
                            <WifiOff
                                size={20}
                                color={colors.subText}
                                style={{ marginLeft: 8 }}
                            />
                        )}
                    </View>

                    <View style={styles.avatarSection}>
                        <View style={styles.avatarWrapper}>
                            {isBroadcasting && (
                                <LottieView
                                    autoPlay
                                    loop
                                    style={styles.lottie}
                                    source={require('@/assets/lottie/scanning.json')}
                                />
                            )}
                            {props.avatarUrl && (
                                <Image
                                    source={{ uri: props.avatarUrl }}
                                    style={styles.avatar}
                                    contentFit="cover"
                                />
                            )}
                        </View>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: colors.cardBg }]}>
                        <Text style={[styles.subtitle, { color: colors.subText }]}>
                            Hold phones back to back — each friend gets your profile.
                        </Text>
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Users
                                    size={22}
                                    color={colors.iconColor}
                                />
                                <Text style={[styles.statValue, { color: colors.accent }]}>{vibes}</Text>
                                <Text style={[styles.statLabel, { color: colors.subText }]}>{vibes === 1 ? 'phone reached' : 'phones reached'}</Text>
                            </View>
                        </View>
                    </View>

                    <ReadinessCard issues={readiness.issues} compact />

                    {readiness.issues.length === 0 && (
                        <View style={[styles.warningCard, { backgroundColor: isDark ? 'rgba(168,85,247,0.1)' : 'rgba(168,85,247,0.06)', borderColor: 'rgba(168,85,247,0.2)' }]}>
                            <AlertTriangle size={18} color={colors.accent} />
                            <Text style={[styles.warningText, { color: colors.textColor }]}>
                                {Platform.OS === 'android'
                                    ? <>Friends with NextVibe open pick you up over <Text style={{ fontFamily: "Dank Mono Bold" }}>Bluetooth</Text>. With <Text style={{ fontFamily: "Dank Mono Bold" }}>NFC</Text> on, any phone can read you with a tap.</>
                                    : <>Ask your friend to open <Text style={{ fontFamily: "Dank Mono Bold" }}>NextVibe</Text> with <Text style={{ fontFamily: "Dank Mono Bold" }}>Bluetooth</Text> on, then hold the phones together.</>}
                            </Text>
                        </View>
                    )}

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                        onPress={handleCopyLink}
                        activeOpacity={0.8}
                        style={[styles.copyLinkButton, {
                            backgroundColor: colors.cardBg,
                            borderColor: copied ? 'rgba(34,197,94,0.4)' : 'rgba(168,85,247,0.25)',
                        }]}
                    >
                        {copied ? (
                            <Check size={18} color="#22c55e" />
                        ) : (
                            <Link2 size={18} color={colors.accent} />
                        )}
                        <Text style={[styles.copyLinkText, { color: copied ? '#22c55e' : colors.textColor }]}>
                            {copied ? 'Link copied!' : 'Copy profile link'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleClose}
                        activeOpacity={0.8}
                        style={styles.buttonContainer}
                    >
                        <LinearGradient
                            colors={['#7c3aed', '#6d28d9']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientButton}
                        >
                            <Text style={styles.buttonText}>Done</Text>
                            <CheckCircle
                                size={20}
                                color="white"
                                style={{ marginLeft: 8 }}
                            />
                        </LinearGradient>
                    </TouchableOpacity>
                </BottomSheetView>
            </BottomSheetModal>
        </>
    );
});

const styles = StyleSheet.create({
    contentContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 10,
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    avatarSection: {
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 50,
        marginTop: 30,
    },
    avatarWrapper: {
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    lottie: {
        width: 250,
        height: 250,
        position: 'absolute',
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#e1e1e1',
        borderWidth: 3,
        borderColor: 'white',
        zIndex: 10,
    },
    infoCard: {
        width: '100%',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        marginBottom: 20,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
    },
    statLabel: {
        fontSize: 14,
    },
    statValue: {
        fontSize: 18,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    copyLinkButton: {
        width: '100%',
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12,
    },
    copyLinkText: {
        fontSize: 15,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    buttonContainer: {
        width: '100%',
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    gradientButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    warningCard: {
        width: '100%',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        gap: 10,
        marginBottom: 20,
    },
    warningText: {
        flex: 1,
        fontFamily: 'Dank Mono',
        fontSize: 12,
        lineHeight: 18,
    },
});

export default ShareModal;
