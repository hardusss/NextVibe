import React, { useState, useEffect, useRef } from "react";
import { AppState, Platform, Vibration, PermissionsAndroid, Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useColorScheme, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { startScanning, stopScanning, addBleDiscoveredListener } from "@/modules/ble-share";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { User, Calendar, Users, Scan, X } from "lucide-react-native";
import { Image } from "expo-image";

// API
import getUserDetail from "@/src/api/user.detail";
import getPost from "@/src/api/get.post";

async function requestAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    try {
        const apiLevel = Number(Platform.Version);
        if (apiLevel >= 31) {
            const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            const scanGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
            const connectGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
            const locationGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

            return scanGranted && connectGranted && locationGranted;
        } else {
            const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            ]);

            const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
            const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

            return fineGranted || coarseGranted;
        }
    } catch (err) {
        console.warn("[useBleScanner] Permission request error:", err);
        return false;
    }
}

interface ScannedInfo {
    type: 'profile' | 'checkin' | 'networking' | 'unknown';
    id?: string;
    eventId?: string;
    userId?: string;
}

function parseScannedPath(path: string): ScannedInfo {
    let cleanPath = path;
    if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    const [pathname, queryString] = cleanPath.split('?');

    // Profile: /u/[id]
    const uMatch = pathname.match(/^\/u\/([^/]+)$/);
    if (uMatch) {
        return { type: 'profile', id: uMatch[1] };
    }

    // Check-in: /event-checkin?postId=[id]
    if (pathname === '/event-checkin') {
        const postIdMatch = queryString?.match(/[?&]postId=([^&#]*)/i) || cleanPath.match(/[?&]postId=([^&#]*)/i);
        if (postIdMatch) {
            return { type: 'checkin', id: decodeURIComponent(postIdMatch[1]) };
        }
    }

    // Networking: /event-nfc-receive?eventId=[eventId]&userId=[userId]
    if (pathname === '/event-nfc-receive') {
        const eventIdMatch = queryString?.match(/[?&]eventId=([^&#]*)/i) || cleanPath.match(/[?&]eventId=([^&#]*)/i);
        const userIdMatch = queryString?.match(/[?&]userId=([^&#]*)/i) || cleanPath.match(/[?&]userId=([^&#]*)/i);
        const eventId = eventIdMatch ? decodeURIComponent(eventIdMatch[1]) : undefined;
        const userId = userIdMatch ? decodeURIComponent(userIdMatch[1]) : undefined;
        if (userId) {
            return { type: 'networking', eventId, userId };
        }
    }

    return { type: 'unknown' };
}

export function useBleScanner() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";

    // Hook states
    const [modalVisible, setModalVisible] = useState(false);
    const [scannedPath, setScannedPath] = useState("");
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [details, setDetails] = useState<{
        type: 'profile' | 'checkin' | 'networking' | 'unknown' | 'error';
        data: any;
    } | null>(null);

    // Refs for control
    const startScannerRef = useRef<() => void>(() => {});
    const stopScannerRef = useRef<() => void>(() => {});

    // Animation values
    const scaleAnim = useRef(new Animated.Value(0.88)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (modalVisible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 120,
                    friction: 9,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.88);
            opacityAnim.setValue(0);
        }
    }, [modalVisible]);

    useEffect(() => {
        if (Platform.OS !== "ios" && Platform.OS !== "android") return;

        let isScanning = false;

        const startScanner = async () => {
            if (isScanning) return;

            try {
                const bluetoothSetting = await AsyncStorage.getItem("bluetooth_scan_enabled");
                if (bluetoothSetting === "false") {
                    if (__DEV__) console.log("[useBleScanner] Background scanning disabled in settings");
                    return;
                }
            } catch (e) {
                console.warn("[useBleScanner] Failed to read settings:", e);
            }

            if (Platform.OS === "android") {
                const hasPermission = await requestAndroidPermissions();
                if (!hasPermission) {
                    if (__DEV__) console.log("[useBleScanner] Android permissions not granted, cannot scan.");
                    return;
                }
            }

            try {
                startScanning();
                isScanning = true;
                if (__DEV__) console.log("[useBleScanner] BLE scanning started");
            } catch (e) {
                console.warn("[useBleScanner] Failed to start BLE scanning:", e);
            }
        };

        const stopScanner = () => {
            if (!isScanning) return;
            try {
                stopScanning();
                isScanning = false;
                if (__DEV__) console.log("[useBleScanner] BLE scanning stopped");
            } catch (e) {
                console.warn("[useBleScanner] Failed to stop BLE scanning:", e);
            }
        };

        startScannerRef.current = startScanner;
        stopScannerRef.current = stopScanner;

        // Start scanning if app is already active
        if (AppState.currentState === "active") {
            startScanner();
        }

        const appStateSub = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active") {
                startScanner();
            } else {
                stopScanner();
            }
        });

        const bleSub = addBleDiscoveredListener(async (event) => {
            if (!event.url) return;

            if (__DEV__) console.log("[useBleScanner] BLE discovered URL:", event.url);

            // Haptic + vibration feedback
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Vibration.vibrate([0, 80, 50, 80]);

            // Stop scanning immediately during processing
            stopScanner();

            // Extract in-app path from full URL
            let path = event.url;
            try {
                if (path.startsWith("https://nextvibe.io")) {
                    path = path.substring("https://nextvibe.io".length);
                } else if (path.startsWith("nextvibe.io")) {
                    path = path.substring("nextvibe.io".length);
                }
            } catch (_) {}

            setScannedPath(path);
            setModalVisible(true);
            setLoadingDetail(true);
            setDetails(null);

            const info = parseScannedPath(path);
            try {
                if (info.type === 'profile' && info.id) {
                    const res = await getUserDetail(Number(info.id));
                    setDetails({ type: 'profile', data: res });
                } else if (info.type === 'checkin' && info.id) {
                    const res = await getPost(Number(info.id));
                    setDetails({ type: 'checkin', data: res?.data || res });
                } else if (info.type === 'networking' && info.userId) {
                    const res = await getUserDetail(Number(info.userId));
                    setDetails({ type: 'networking', data: res });
                } else {
                    setDetails({ type: 'unknown', data: null });
                }
            } catch (err) {
                console.error("[useBleScanner] Error fetching details:", err);
                setDetails({ type: 'error', data: null });
            } finally {
                setLoadingDetail(false);
            }
        });

        return () => {
            appStateSub.remove();
            bleSub.remove();
            stopScanner();
        };
    }, []);

    const handleAccept = () => {
        setModalVisible(false);
        try {
            router.push(scannedPath as any);
        } catch (err) {
            console.error("[useBleScanner] Navigation error:", err);
        }
        // Small timeout to allow native transition to initiate before scanning resumes
        setTimeout(() => {
            startScannerRef.current();
        }, 800);
    };

    const handleDecline = () => {
        setModalVisible(false);
        startScannerRef.current();
    };

    const renderBleScanModal = () => {
        if (!modalVisible) return null;

        // Custom titles and buttons
        let modalTitle = "Знайдено посилання";
        let message = "Бажаєте перейти за посиланням?";
        let confirmLabel = "Перейти";
        let detailName = "";
        let avatarUrl: string | null = null;
        let isOfficial = false;

        const info = parseScannedPath(scannedPath);

        if (details) {
            if (details.type === 'profile') {
                modalTitle = "Знайдено профіль";
                detailName = details.data?.username ? `@${details.data.username}` : "";
                avatarUrl = details.data?.avatar || details.data?.avatar_url || null;
                isOfficial = !!details.data?.official;
                message = "Бажаєте відвідати профіль користувача?";
                confirmLabel = "Перейти";
            } else if (details.type === 'checkin') {
                modalTitle = "Реєстрація на подію";
                detailName = details.data?.about || "Подія NextVibe";
                message = "Бажаєте зареєструватися та відмітитися на події?";
                confirmLabel = "Відмітитися";
            } else if (details.type === 'networking') {
                modalTitle = "Обмін контактами";
                detailName = details.data?.username ? `@${details.data.username}` : "";
                avatarUrl = details.data?.avatar || details.data?.avatar_url || null;
                isOfficial = !!details.data?.official;
                message = "Бажаєте підключитися та розпочати обмін контактами?";
                confirmLabel = "З'єднатися";
            } else if (details.type === 'error') {
                message = "Не вдалося завантажити деталі. Бажаєте все одно перейти за посиланням?";
            }
        }

        const bgStyle = isDark ? styles.modalDark : styles.modalLight;
        const textStyle = isDark ? styles.textDark : styles.textLight;
        const subTextStyle = isDark ? styles.subTextDark : styles.subTextLight;

        return (
            <Modal
                visible={modalVisible}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={handleDecline}
            >
                {/* Backdrop */}
                <View style={styles.backdrop}>
                    <BlurView style={StyleSheet.absoluteFill} tint={isDark ? "dark" : "light"} intensity={25} />
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDecline} />
                </View>

                {/* Dialog Container */}
                <View style={styles.center} pointerEvents="box-none">
                    <Animated.View style={[
                        styles.dialog,
                        bgStyle,
                        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }
                    ]}>
                        {/* Top Accent Gradient Line */}
                        <LinearGradient
                            colors={['#A855F7', '#7C3AED']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.topLine}
                        />

                        {/* Close Button */}
                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={handleDecline}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <X size={16} color={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} strokeWidth={2} />
                        </TouchableOpacity>

                        <View style={styles.content}>
                            {/* Top Icon Ring */}
                            <View style={styles.iconRing}>
                                <LinearGradient
                                    colors={['rgba(168,85,247,0.15)', 'rgba(124,58,237,0.08)']}
                                    style={styles.iconBg}
                                >
                                    {info.type === 'checkin' ? (
                                        <Calendar size={28} color="#A855F7" strokeWidth={1.8} />
                                    ) : info.type === 'networking' ? (
                                        <Users size={28} color="#A855F7" strokeWidth={1.8} />
                                    ) : (
                                        <User size={28} color="#A855F7" strokeWidth={1.8} />
                                    )}
                                </LinearGradient>
                            </View>

                            <Text style={[styles.title, textStyle]}>{modalTitle}</Text>

                            {/* Loading State or Details Content */}
                            {loadingDetail ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color="#A855F7" />
                                    <Text style={[styles.loadingText, subTextStyle]}>Завантаження деталей...</Text>
                                </View>
                            ) : (
                                <View style={styles.detailContainer}>
                                    {/* Optional avatar view */}
                                    {info.type !== 'checkin' && (avatarUrl || details?.type === 'profile' || details?.type === 'networking') && (
                                        <View style={styles.avatarWrapper}>
                                            <Image
                                                source={{ uri: avatarUrl || 'https://media.nextvibe.io/images/default.png' }}
                                                style={styles.avatar}
                                            />
                                        </View>
                                    )}

                                    {!!detailName && (
                                        <Text style={[styles.detailNameText, textStyle]} numberOfLines={2}>
                                            {detailName}
                                        </Text>
                                    )}

                                    <Text style={[styles.message, subTextStyle]}>{message}</Text>
                                </View>
                            )}

                            {/* Action Buttons */}
                            <View style={styles.buttons}>
                                <TouchableOpacity
                                    style={[styles.cancelBtn, isDark ? styles.cancelBtnDark : styles.cancelBtnLight]}
                                    onPress={handleDecline}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.cancelLabel, isDark ? styles.cancelLabelDark : styles.cancelLabelLight]}>Скасувати</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.confirmBtn}
                                    onPress={handleAccept}
                                    activeOpacity={0.8}
                                    disabled={loadingDetail}
                                >
                                    <LinearGradient
                                        colors={loadingDetail ? ['#cbd5e1', '#94a3b8'] : ['#A855F7', '#7C3AED']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.confirmGradient}
                                    >
                                        <Text style={styles.confirmLabel}>{confirmLabel}</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        );
    };

    return { renderBleScanModal };
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        zIndex: 9999,
    },
    dialog: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
    },
    modalDark: {
        backgroundColor: '#110a1e',
        borderColor: 'rgba(168,85,247,0.25)',
    },
    modalLight: {
        backgroundColor: '#ffffff',
        borderColor: 'rgba(168,85,247,0.15)',
    },
    topLine: {
        height: 3,
        width: '100%',
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 10,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    iconRing: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        overflow: 'hidden',
        marginBottom: 16,
    },
    iconBg: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: 0.2,
        includeFontPadding: false,
    },
    textDark: {
        color: '#ffffff',
    },
    textLight: {
        color: '#111827',
    },
    subTextDark: {
        color: 'rgba(255,255,255,0.6)',
    },
    subTextLight: {
        color: 'rgba(17,24,39,0.6)',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 16,
        gap: 8,
    },
    loadingText: {
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
    detailContainer: {
        alignItems: 'center',
        width: '100%',
        marginBottom: 20,
    },
    avatarWrapper: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 2,
        borderColor: '#A855F7',
        overflow: 'hidden',
        marginBottom: 10,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    detailNameText: {
        fontSize: 15,
        fontFamily: 'Dank Mono Bold',
        textAlign: 'center',
        marginBottom: 8,
        includeFontPadding: false,
    },
    message: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 8,
        includeFontPadding: false,
    },
    buttons: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    cancelBtn: {
        flex: 1,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtnDark: {
        backgroundColor: 'rgba(168,85,247,0.07)',
        borderColor: 'rgba(168,85,247,0.15)',
    },
    cancelBtnLight: {
        backgroundColor: 'rgba(168,85,247,0.04)',
        borderColor: 'rgba(168,85,247,0.1)',
    },
    cancelLabel: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    cancelLabelDark: {
        color: 'rgba(255,255,255,0.7)',
    },
    cancelLabelLight: {
        color: 'rgba(17,24,39,0.7)',
    },
    confirmBtn: {
        flex: 1,
        height: 44,
        borderRadius: 12,
        overflow: 'hidden',
    },
    confirmGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmLabel: {
        fontSize: 13,
        color: '#ffffff',
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
});
