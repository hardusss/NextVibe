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

/**
 * Exposes imperative methods to control the visibility of the ShareModal.
 */
export interface ShareModalRef {
    /** Opens the bottom sheet modal. */
    present: () => void;
    /** Closes the bottom sheet modal. */
    dismiss: () => void;
}

/**
 * Properties for the ShareModal component.
 */
export interface ShareModalProps {
    /** The URL of the user's avatar image to display. Null if no avatar is set. */
    avatarUrl: string | null;
    /** The profile URL to be broadcasted via NFC. Defaults to a fallback URL if not provided. */
    profileUrl?: string;
}

/**
 * A full-screen overlay that renders an animated neon glow effect around the screen edges.
 * Uses a transparent Modal to ensure it renders above all other UI elements (like BottomSheets),
 * and utilizes `pointerEvents="none"` so it doesn't block user interactions.
 * * @param {Object} props - Component properties.
 * @param {Animated.Value} props.opacity - The animated value controlling the visibility/fade of the glow.
 */
const NeonGlowOverlay = ({ opacity }: { opacity: Animated.Value }) => {
    const GLOW_SIZE = 80; 

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
                {/* Left Edge Glow */}
                <LinearGradient
                    colors={[
                        'rgba(139, 92, 246, 0.85)',
                        'rgba(139, 92, 246, 0.4)',
                        'rgba(139, 92, 246, 0)',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[StyleSheet.absoluteFillObject, { right: undefined, width: GLOW_SIZE }]}
                />

                {/* Right Edge Glow */}
                <LinearGradient
                    colors={[
                        'rgba(139, 92, 246, 0)',
                        'rgba(139, 92, 246, 0.4)',
                        'rgba(139, 92, 246, 0.85)',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[StyleSheet.absoluteFillObject, { left: undefined, width: GLOW_SIZE }]}
                />

                {/* Bottom Edge Glow */}
                <LinearGradient
                    colors={[
                        'rgba(109, 40, 217, 0)',
                        'rgba(109, 40, 217, 0.5)',
                        'rgba(109, 40, 217, 0.9)',
                    ]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[StyleSheet.absoluteFillObject, { top: undefined, height: GLOW_SIZE }]}
                />

                {/* Bottom-Left Corner Accent */}
                <LinearGradient
                    colors={['rgba(167, 139, 250, 0.5)', 'rgba(167, 139, 250, 0)']}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        width: GLOW_SIZE * 1.5,
                        height: GLOW_SIZE * 1.5,
                    }}
                />

                {/* Bottom-Right Corner Accent */}
                <LinearGradient
                    colors={['rgba(167, 139, 250, 0)', 'rgba(167, 139, 250, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: GLOW_SIZE * 1.5,
                        height: GLOW_SIZE * 1.5,
                    }}
                />
            </Animated.View>
        </Modal>
    );
};

/**
 * A BottomSheet modal component that facilitates sharing a user profile via NFC (Host Card Emulation).
 * Features a visual neon glow animation and status bar color change upon successful NFC reads.
 */
const ShareModal = forwardRef<ShareModalRef, ShareModalProps>((props, ref) => {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    // Theme-dependent styling
    const colors = isDark ? {
        background: '#0f021c',
        cardBg: 'rgba(255, 255, 255, 0.05)',
        textColor: '#ffffff',
        subText: '#a1a1aa',
        handleColor: '#ffffff',
        accent: '#a855f7',
        iconColor: '#d8b4fe',
        statusBarStyle: 'light-content' as const,
        statusBarBg: '#000000',
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

    // Sync status bar styling with the current device theme
    useEffect(() => {
        StatusBar.setBarStyle(colors.statusBarStyle, true);
        StatusBar.setBackgroundColor(colors.statusBarBg, true);
    }, [isDark]);

    // Cleanup HCE session on unmount
    useEffect(() => {
        return () => { stopHceBroadcast(); };
    }, []);

    useImperativeHandle(ref, () => ({
        present: () => bottomSheetModalRef.current?.present(),
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    /**
     * Resets the local state, effectively clearing read counts and hiding animations.
     */
    const resetState = () => {
        setVibes(0);
        setIsBroadcasting(false);
        lastReadTimestamp.current = 0;
        setShowGlow(false);
        glowOpacity.setValue(0);
    };

    /**
     * Triggers the full-screen neon glow and momentarily flashes the status bar
     * to provide visual feedback for a successful NFC read.
     */
    const triggerNeonGlow = () => {
        glowAnimRef.current?.stop();

        setShowGlow(true);
        glowOpacity.setValue(0);

        // Momentarily change status bar color to match the glow
        StatusBar.setBarStyle('light-content', true);
        StatusBar.setBackgroundColor('#6d28d9', true);
        setTimeout(() => {
            StatusBar.setBarStyle(colors.statusBarStyle, true);
            StatusBar.setBackgroundColor(colors.statusBarBg, true);
        }, 1000);

        // Play the fade in/out animation sequence
        const anim = Animated.sequence([
            Animated.timing(glowOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
                toValue: 0,
                duration: 1000,
                delay: 200,
                useNativeDriver: true,
            }),
        ]);

        glowAnimRef.current = anim;
        anim.start(({ finished }) => {
            if (finished) setShowGlow(false); 
        });
    };

    /**
     * Initializes and starts the Host Card Emulation (HCE) broadcasting.
     * Sets up listeners for NFC read events and debounces duplicate scans.
     */
    const startHceBroadcast = async () => {
        if (isBroadcasting) return;
        try {
            const urlToShare = props.profileUrl || "https://nextvibe.io/u/132";
            const tag = new NFCTagType4({
                type: NFCTagType4NDEFContentType.URL,
                content: urlToShare,
                writable: false,
            });
            const session = await HCESession.getInstance();
            hceSessionRef.current = session;
            await session.setApplication(tag);
            await session.setEnabled(true);

            // Listen for successful NFC reads by another device
            removeListenerRef.current = session.on(HCESession.Events.HCE_STATE_READ, () => {
                const now = Date.now();
                // Debounce reads to prevent spamming triggers (2 seconds cooldown)
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

    /**
     * Stops the HCE broadcasting session and removes event listeners.
     */
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

    /**
     * Handles changes to the bottom sheet's snap index.
     * Starts broadcasting when opened, and cleans up when fully closed.
     * * @param {number} index - The current snap index of the bottom sheet.
     */
    const handleSheetChanges = useCallback((index: number) => {
        if (index >= 0) {
            startHceBroadcast();
        } else {
            stopHceBroadcast();
            resetState();
        }
    }, [props.profileUrl]);

    /**
     * Programmatically dismisses the modal and stops broadcasting.
     */
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
                {/* UI Implementation */}
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
        marginTop: 20
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