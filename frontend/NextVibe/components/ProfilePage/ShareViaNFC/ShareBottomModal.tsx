import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import {
    Text, StyleSheet, View, useColorScheme,
    TouchableOpacity, Animated, StatusBar, Modal
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop
} from '@gorhom/bottom-sheet';
import FastImage from 'react-native-fast-image';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HCESession, NFCTagType4, NFCTagType4NDEFContentType } from 'react-native-hce';

export interface ShareModalRef {
    present: () => void;
    dismiss: () => void;
}

export interface ShareModalProps {
    avatarUrl: string | null;
    profileUrl?: string;
}

const NeonGlowOverlay = ({ opacity }: { opacity: Animated.Value }) => {
    // Менший розмір — елегантніший ефект
    const SIDE = 55;   // ширина бокових смуг
    const BOTTOM = 70; // висота нижньої смуги
    const CORNER = 65; // кутові акценти

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
                {/* Ліва смуга — тонка, виражений градієнт */}
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

                {/* Права смуга */}
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

                {/* Нижня смуга — найвиразніша */}
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

                {/* Нижній лівий кут */}
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

                {/* Нижній правий кут */}
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
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [vibes, setVibes] = useState(0);
    const [showGlow, setShowGlow] = useState(false);

    const hceSessionRef = useRef<any>(null);
    const removeListenerRef = useRef<(() => void) | null>(null);
    const lastReadTimestamp = useRef<number>(0);
    const glowAnimRef = useRef<Animated.CompositeAnimation | null>(null);

    const glowOpacity = useRef(new Animated.Value(0)).current;

    const snapPoints = useMemo(() => ['50%', '65%'], []);

    useEffect(() => {
        StatusBar.setBarStyle(colors.statusBarStyle, true);
        StatusBar.setBackgroundColor(colors.statusBarBg, true);
    }, [isDark]);

    useEffect(() => {
        return () => { stopHceBroadcast(); };
    }, []);

    useImperativeHandle(ref, () => ({
        present: () => bottomSheetModalRef.current?.present(),
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const resetState = () => {
        setVibes(0);
        setIsBroadcasting(false);
        lastReadTimestamp.current = 0;
        setShowGlow(false);
        glowOpacity.setValue(0);
    };

    const triggerNeonGlow = () => {
        glowAnimRef.current?.stop();
        setShowGlow(true);
        glowOpacity.setValue(0);

        // Статусбар: м'який фіолетовий спалах на 1 секунду
        StatusBar.setBarStyle('light-content', true);
        StatusBar.setBackgroundColor('#5b21b6', true);
        setTimeout(() => {
            StatusBar.setBarStyle(colors.statusBarStyle, true);
            StatusBar.setBackgroundColor(colors.statusBarBg, true);
        }, 1000);

        const anim = Animated.sequence([
            // Швидкий спалах
            Animated.timing(glowOpacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }),
            // Повільне, плавне згасання
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

    const startHceBroadcast = async () => {
        if (isBroadcasting) return;
        try {
            const urlToShare = props.profileUrl || "https://nextvibe.io/u/39";
            const tag = new NFCTagType4({
                type: NFCTagType4NDEFContentType.URL,
                content: urlToShare,
                writable: false,
            });
            const session = await HCESession.getInstance();
            hceSessionRef.current = session;
            await session.setApplication(tag);
            await session.setEnabled(true);

            removeListenerRef.current = session.on(HCESession.Events.HCE_STATE_READ, () => {
                const now = Date.now();
                if (now - lastReadTimestamp.current > 2000) {
                    console.log("✅ Valid read! Incrementing vibes.");
                    setVibes(prev => prev + 1);
                    lastReadTimestamp.current = now;
                    triggerNeonGlow();
                } else {
                    console.log("⚠️ Debounced duplicate read (ignored)");
                }
            });

            setIsBroadcasting(true);
            console.log("✅ HCE Broadcasting started.");
        } catch (error) {
            console.error("❌ Failed to start HCE:", error);
        }
    };

    const stopHceBroadcast = async () => {
        try {
            if (hceSessionRef.current) {
                await hceSessionRef.current.setEnabled(false);
            }
            if (removeListenerRef.current) {
                removeListenerRef.current();
                removeListenerRef.current = null;
            }
            console.log("🛑 HCE Broadcasting stopped.");
        } catch (error) {
            console.warn("Error stopping HCE:", error);
        }
    };

    const handleSheetChanges = useCallback((index: number) => {
        if (index >= 0) {
            startHceBroadcast();
        } else {
            stopHceBroadcast();
            resetState();
        }
    }, [props.profileUrl]);

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
                    stopHceBroadcast();
                    resetState();
                }}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: colors.handleColor, width: 40, opacity: 0.5 }}
            >
                <BottomSheetView style={[styles.contentContainer, { backgroundColor: colors.background }]}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color: colors.textColor }]}>
                            {isBroadcasting ? "Broadcasting Profile..." : "Ready to Share"}
                        </Text>
                        <MaterialCommunityIcons
                            name={(isBroadcasting ? "access-point" : "nfc-variant-off") as any}
                            size={20}
                            color={isBroadcasting ? colors.accent : colors.subText}
                            style={{ marginLeft: 8 }}
                        />
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
                                <FastImage
                                    source={{ uri: props.avatarUrl }}
                                    style={styles.avatar}
                                    resizeMode={FastImage.resizeMode.cover}
                                />
                            )}
                        </View>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: colors.cardBg }]}>
                        <Text style={[styles.subtitle, { color: colors.subText }]}>
                            Keep tapping! Multiple friends can collect.
                        </Text>
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <MaterialCommunityIcons
                                    name="account-group-outline"
                                    size={22}
                                    color={colors.iconColor}
                                />
                                <Text style={[styles.statValue, { color: colors.accent }]}>{vibes}</Text>
                                <Text style={[styles.statLabel, { color: colors.subText }]}>vibes shared</Text>
                            </View>
                        </View>
                    </View>

                    <View style={{ flex: 1 }} />

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
                            <MaterialCommunityIcons
                                name="check-circle-outline"
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
});

export default ShareModal;