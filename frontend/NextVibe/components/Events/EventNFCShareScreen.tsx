import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, useColorScheme, ActivityIndicator, Platform, Vibration } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Radio, AlertTriangle, Star, Users } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import { startSharing, stopSharing } from '@/modules/nfc-send';
import { startBroadcasting, stopBroadcasting } from '@/modules/ble-share';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';

export default function EventNFCShareScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const params = useLocalSearchParams<{ eventId: string }>();
    const eventId = params.eventId;

    const [userId, setUserId] = useState<string | null>(null);
    const [initialConnections, setInitialConnections] = useState<number[]>([]);
    const [successUser, setSuccessUser] = useState<any>(null);
    const [successPoints, setSuccessPoints] = useState<number>(0);
    const [displayPoints, setDisplayPoints] = useState<number>(0);
    const [successState, setSuccessState] = useState<boolean>(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isBroadcastingRef = useRef<boolean>(false);

    const bg = isDark ? '#0A0410' : '#FFFFFF';
    const main = isDark ? '#FFFFFF' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(17,24,39,0.5)';
    const accent = '#A855F7';
    const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';

    const startSharingSession = (url: string) => {
        if (isBroadcastingRef.current) return;
        isBroadcastingRef.current = true;
        if (Platform.OS === 'ios') {
            startBroadcasting(url);
        } else {
            startSharing(url);
        }
    };

    const stopSharingSession = () => {
        if (!isBroadcastingRef.current) return;
        isBroadcastingRef.current = false;
        if (Platform.OS === 'ios') {
            stopBroadcasting();
        } else {
            stopSharing();
        }
    };

    const checkNewConnections = async (currentKnownIds: number[]) => {
        try {
            const token = await storage.getItem('access');
            const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const eventData = res.data.find((e: any) => e.event_id === Number(eventId));
            if (!eventData) return currentKnownIds;

            const currentConns = eventData.connections || [];
            const newConn = currentConns.find((c: any) => !currentKnownIds.includes(c.user_id));

            if (newConn) {
                stopSharingSession();

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                Vibration.vibrate([0, 50, 50, 50, 50, 100]);

                setSuccessUser({
                    username: newConn.username,
                    avatar: newConn.avatar,
                    is_official: newConn.is_official
                });
                setSuccessPoints(newConn.rep_received || 2);
                setSuccessState(true);

                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }

                return [...currentKnownIds, newConn.user_id];
            }
            return currentKnownIds;
        } catch (e) {
            console.error('Error polling connections:', e);
            return currentKnownIds;
        }
    };

    const handleContinue = async () => {
        setSuccessState(false);
        setSuccessUser(null);
        setSuccessPoints(0);
        setDisplayPoints(0);

        if (userId) {
            const shareUrl = `https://nextvibe.io/event-nfc-receive?eventId=${eventId}&userId=${userId}`;
            startSharingSession(shareUrl);
        }

        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }

        let knownIds = [...initialConnections];
        pollingRef.current = setInterval(async () => {
            knownIds = await checkNewConnections(knownIds);
            setInitialConnections(knownIds);
        }, 2500);
    };

    useEffect(() => {
        if (successState && successPoints > 0) {
            let current = 0;
            const interval = setInterval(() => {
                current += 1;
                setDisplayPoints(current);
                Vibration.vibrate(40);
                if (current >= successPoints) clearInterval(interval);
            }, 80);
            return () => clearInterval(interval);
        }
    }, [successState, successPoints]);

    useEffect(() => {
        let active = true;
        let knownIds: number[] = [];

        const init = async () => {
            try {
                const storedId = await storage.getItem('id');
                if (!storedId) {
                    console.error('No user ID found in storage');
                    return;
                }
                setUserId(storedId);

                const token = await storage.getItem('access');
                const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const eventData = res.data.find((e: any) => e.event_id === Number(eventId));
                if (eventData && eventData.connections) {
                    knownIds = eventData.connections.map((c: any) => c.user_id);
                    setInitialConnections(knownIds);
                }

                if (!active) return;

                const shareUrl = `https://nextvibe.io/event-nfc-receive?eventId=${eventId}&userId=${storedId}`;
                startSharingSession(shareUrl);

                pollingRef.current = setInterval(async () => {
                    if (active) {
                        knownIds = await checkNewConnections(knownIds);
                        setInitialConnections(knownIds);
                    }
                }, 2500);

            } catch (e) {
                console.error('Failed to initialize sharing & polling:', e);
            }
        };

        if (eventId) {
            init();
        }

        return () => {
            active = false;
            stopSharingSession();
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [eventId]);

    if (!eventId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
                <Text style={{ color: main }}>Invalid Event</Text>
            </SafeAreaView>
        );
    }

    const broadcastLabel = Platform.OS === 'ios' ? 'Bluetooth' : 'NFC';

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
                {!userId ? (
                    <ActivityIndicator size="large" color={accent} />
                ) : (
                    successState ? (
                        <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.fullScreenSuccess}>
                            <Animated.View entering={FadeInDown.delay(200).springify()}>
                                <View style={styles.avatarsRow}>
                                    {successUser?.avatar ? (
                                        <Image source={{ uri: successUser.avatar }} style={styles.scannedAvatar} />
                                    ) : (
                                        <View style={[styles.scannedAvatar, { backgroundColor: 'rgba(168,85,247,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
                                            <Users size={32} color={accent} />
                                        </View>
                                    )}
                                </View>
                            </Animated.View>

                            <Animated.Text entering={FadeInDown.delay(400)} style={[styles.heading, { color: main, fontSize: 24, marginTop: 16 }]}>
                                Connected with {successUser?.username}
                            </Animated.Text>

                            <Animated.View entering={FadeInDown.delay(600)} style={styles.repBadge}>
                                <Star size={24} color="#fbbf24" fill="#fbbf24" />
                                <Text style={styles.repPointsText}>+{displayPoints} Rep</Text>
                            </Animated.View>

                            <Animated.Text entering={FadeInDown.delay(800)} style={[styles.description, { color: muted, fontSize: 16, marginTop: 16 }]}>
                                You both earned reputation for networking!
                            </Animated.Text>

                            <Animated.View entering={FadeInUp.delay(1200)} style={{ width: "100%", paddingHorizontal: 40, marginTop: 40, gap: 12 }}>
                                <TouchableOpacity
                                    onPress={handleContinue}
                                    activeOpacity={0.8}
                                    style={[styles.verifyBtn, {
                                        backgroundColor: "rgba(168,85,247,0.12)",
                                        borderColor: "rgba(168,85,247,0.3)",
                                    }]}
                                >
                                    <Text style={[styles.verifyBtnText, { color: "#c084fc" }]}>
                                        Continue Networking
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => router.back()}
                                    activeOpacity={0.8}
                                    style={[styles.verifyBtn, {
                                        backgroundColor: "transparent",
                                        borderColor: "transparent",
                                    }]}
                                >
                                    <Text style={[styles.verifyBtnText, { color: muted }]}>
                                        Done
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                            <Animated.View entering={FadeInDown.delay(200)}>
                                <View style={styles.animationContainer}>
                                    <LottieView
                                        autoPlay
                                        loop
                                        style={styles.lottie}
                                        source={require('@/assets/lottie/scanning.json')}
                                    />
                                    <View style={[styles.iconCircle, { backgroundColor: accent }]}>
                                        <Radio size={32} color="#ffffff" />
                                    </View>
                                </View>
                            </Animated.View>

                            <Text style={[styles.heading, { color: main }]}>
                                Ready to Network
                            </Text>
                            <Text style={[styles.description, { color: muted }]}>
                                Hold your phone near another attendee's phone to connect and share reputation via {broadcastLabel}!
                            </Text>

                            {Platform.OS === 'ios' ? (
                                <View style={[styles.warningCard, { backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.2)' }]}>
                                    <AlertTriangle size={18} color="#A855F7" style={{ marginBottom: 2 }} />
                                    <Text style={[styles.warningTitle, { color: main }]}>iOS Proximity Requirements</Text>
                                    <Text style={[styles.warningText, { color: muted }]}>
                                        Please ask the other person to enable <Text style={{ fontFamily: 'Dank Mono Bold', color: main }}>Bluetooth</Text> and open the <Text style={{ fontFamily: 'Dank Mono Bold', color: main }}>NextVibe</Text> app on their phone to receive.
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                                    <Text style={[styles.infoCardText, { color: muted }]}>
                                        Make sure the other person's screen is unlocked.
                                    </Text>
                                </View>
                            )}
                        </Animated.View>
                    )
                )}
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        marginBottom: 14,
        paddingHorizontal: 18,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 16,
        includeFontPadding: false,
    },
    main: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    centerContent: {
        alignItems: 'center',
        gap: 16,
        width: '100%',
    },
    animationContainer: {
        width: 250,
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        marginBottom: 20,
    },
    lottie: {
        width: 250,
        height: 250,
        position: 'absolute',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    heading: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 24,
        includeFontPadding: false,
        textAlign: 'center',
    },
    description: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        includeFontPadding: false,
        paddingHorizontal: 10,
    },
    infoCard: {
        marginTop: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        width: '100%',
    },
    infoCardText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        textAlign: 'center',
    },
    warningCard: {
        marginTop: 20,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        width: '100%',
        alignItems: 'center',
        gap: 6,
    },
    warningTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 13,
        textAlign: 'center',
        includeFontPadding: false,
    },
    warningText: {
        fontFamily: 'Dank Mono',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        includeFontPadding: false,
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
    }
});
