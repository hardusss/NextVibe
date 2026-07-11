import React, { useState, useEffect } from "react";
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
    ActivityIndicator,
    Vibration,
    Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ShieldX, Radio, Users, Star } from "lucide-react-native";
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring } from "react-native-reanimated";
import { Image } from "expo-image";
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import * as Location from 'expo-location';

type ConnectionState = "idle" | "locating" | "connecting" | "success" | "error";

export default function EventNFCReceiveScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const params = useLocalSearchParams<{ eventId: string; userId: string }>();
    const eventId = params.eventId ? parseInt(params.eventId, 10) : null;
    const scannedUserId = params.userId ? parseInt(params.userId, 10) : null;

    const [state, setState] = useState<ConnectionState>("idle");
    const [message, setMessage] = useState("");
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [displayPoints, setDisplayPoints] = useState(0);
    const [scannedUser, setScannedUser] = useState<any>(null);

    const bg = isDark ? "#0A0410" : "#FFFFFF";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const accent = "#A855F7";

    // Pulse animation
    const pulseScale = useSharedValue(1);
    useEffect(() => {
        if (state === "idle" || state === "locating" || state === "connecting") {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.08, { duration: 1200 }),
                    withTiming(1, { duration: 1200 })
                ), -1, true
            );
        } else {
            pulseScale.value = withSpring(1);
        }
    }, [state]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    useEffect(() => {
        if (eventId && scannedUserId && state === "idle") {
            handleConnect();
        }
    }, [eventId, scannedUserId]);

    const handleConnect = async () => {
        if (!eventId || !scannedUserId) {
            setState("error");
            setMessage(Platform.OS === 'ios' ? "Invalid BLE data." : "Invalid NFC data.");
            return;
        }

        setState("locating");
        let location = null;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setState("error");
                setMessage("Location permission is required to connect with other attendees.");
                Vibration.vibrate([0, 200]);
                return;
            }

            location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (location.mocked) {
                setState("error");
                setMessage("Fake GPS detected. Real moments only.");
                Vibration.vibrate([0, 200]);
                return;
            }
        } catch (e) {
            console.warn("Location error:", e);
            setState("error");
            setMessage("Failed to get location coordinates.");
            Vibration.vibrate([0, 200]);
            return;
        }

        setState("connecting");
        try {
            const token = await storage.getItem('access');
            const response = await axios.post(`${GetApiUrl()}/posts/event-nfc-connect/`, {
                event_id: eventId,
                scanned_user_id: scannedUserId,
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                setEarnedPoints(response.data.earned_points || 0);
                setScannedUser(response.data.scanned_user);
                setState("success");
                Vibration.vibrate([0, 50, 50, 50, 50, 100]);
            }
        } catch (error: any) {
            setState("error");
            setMessage(error.response?.data?.error || "Failed to connect. Please try again.");
            Vibration.vibrate([0, 200]);
        }
    };

    useEffect(() => {
        if (state === "success" && earnedPoints > 0) {
            let current = 0;
            const interval = setInterval(() => {
                current += 1;
                setDisplayPoints(current);
                Vibration.vibrate(40);
                if (current >= earnedPoints) clearInterval(interval);
            }, 80);
            return () => clearInterval(interval);
        }
    }, [state, earnedPoints]);

    const renderContent = () => {
        switch (state) {
            case "idle":
            case "locating":
            case "connecting":
                return (
                    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.centerContent}>
                        <Animated.View style={[styles.iconCircle, {
                            backgroundColor: "rgba(168,85,247,0.1)",
                            borderColor: "rgba(168,85,247,0.2)",
                        }, pulseStyle]}>
                            <Radio size={48} color={accent} strokeWidth={1.5} />
                        </Animated.View>

                        <Text style={[styles.heading, { color: main }]}>
                            Networking...
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {state === "locating" ? "Getting your location..." : "Waiting for reputation..."}
                        </Text>
                    </Animated.View>
                );

            case "error":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        <View style={[styles.iconCircle, {
                            backgroundColor: "rgba(239,68,68,0.1)",
                            borderColor: "rgba(239,68,68,0.25)",
                        }]}>
                            <ShieldX size={48} color="#f87171" strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: "#f87171" }]}>
                            Connection Failed
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {message}
                        </Text>

                        <TouchableOpacity
                            onPress={() => router.back()}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "rgba(255,255,255,0.05)",
                                borderColor: border,
                                marginTop: 16,
                            }]}
                        >
                            <Text style={[styles.verifyBtnText, { color: main }]}>
                                Go Back
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                );

            case "success":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.fullScreenSuccess}>
                        <Animated.View entering={FadeInDown.delay(200).springify()}>
                            <View style={styles.avatarsRow}>
                                {scannedUser?.avatar ? (
                                    <Image source={{ uri: scannedUser.avatar }} style={styles.scannedAvatar} />
                                ) : (
                                    <View style={[styles.scannedAvatar, { backgroundColor: 'rgba(168,85,247,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
                                        <Users size={32} color={accent} />
                                    </View>
                                )}
                            </View>
                        </Animated.View>

                        <Animated.Text entering={FadeInDown.delay(400)} style={[styles.heading, { color: main, fontSize: 24, marginTop: 16 }]}>
                            Connected with {scannedUser?.username}
                        </Animated.Text>

                        <Animated.View entering={FadeInDown.delay(600)} style={styles.repBadge}>
                            <Star size={24} color="#fbbf24" fill="#fbbf24" />
                            <Text style={styles.repPointsText}>+{displayPoints} Rep</Text>
                        </Animated.View>

                        <Animated.Text entering={FadeInDown.delay(800)} style={[styles.description, { color: muted, fontSize: 16, marginTop: 16 }]}>
                            You both earned reputation for networking!
                        </Animated.Text>

                        <Animated.View entering={FadeInUp.delay(1200)} style={{ width: "100%", paddingHorizontal: 40, marginTop: 40 }}>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                activeOpacity={0.8}
                                style={[styles.verifyBtn, {
                                    backgroundColor: "rgba(34,197,94,0.12)",
                                    borderColor: "rgba(34,197,94,0.3)",
                                }]}
                            >
                                <Text style={[styles.verifyBtnText, { color: "#4ade80" }]}>
                                    Awesome
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </Animated.View>
                );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            <View style={styles.header}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.back()}
                    style={styles.backBtn}
                >
                    <ChevronLeft size={22} color={main} strokeWidth={2} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: main }]}>
                    {Platform.OS === 'ios' ? 'BLE Networking' : 'NFC Networking'}
                </Text>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.main}>
                {renderContent()}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 6,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 6,
        marginBottom: 14,
        paddingHorizontal: 18,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
    },
    main: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    centerContent: {
        alignItems: "center",
        gap: 16,
        width: "100%",
    },
    iconCircle: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 1.5,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 8,
    },
    heading: {
        fontFamily: "Dank Mono Bold",
        fontSize: 22,
        includeFontPadding: false,
        textAlign: "center",
    },
    description: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        includeFontPadding: false,
        paddingHorizontal: 10,
    },
    verifyBtn: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    verifyBtnText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },
    fullScreenSuccess: {
        flex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 40,
    },
    avatarsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scannedAvatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#A855F7',
    },
    repBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(251,191,36,0.15)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 30,
        marginTop: 20,
    },
    repPointsText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 28,
        color: "#fbbf24",
        includeFontPadding: false,
    },
});
