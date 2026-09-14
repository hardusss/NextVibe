import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, useColorScheme, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Radio, AlertTriangle, Camera, ShieldX } from 'lucide-react-native';
import { FEATURE_PROOF_OF_MEET } from '@/constants/FeatureFlags';
import LottieView from 'lottie-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import axios from 'axios';
import { startSharing, stopSharing } from '@/modules/nfc-send';
import { startBroadcasting, stopBroadcasting } from '@/modules/ble-share';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import { useProximityToken } from '@/hooks/useProximityToken';
import TokenExpiryBadge from '@/components/Events/TokenExpiryBadge';
import haptics from '@/src/utils/haptics';
import { MOTION } from '@/constants/motion';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import CustomActivityIndicator from '@/components/CustomActivityIndicator';
import EventScreenShell from '@/components/Events/EventScreenShell';
import EventCta from '@/components/Events/EventCta';
import MeetSuccess from '@/components/Events/MeetSuccess';

export default function EventNFCShareScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const params = useLocalSearchParams<{ eventId?: string; mode?: string }>();
    const eventId = params.eventId;
    const isIrl = params.mode === 'irl';

    const [userId, setUserId] = useState<string | null>(null);
    const [initialConnections, setInitialConnections] = useState<number[]>([]);
    const [successUser, setSuccessUser] = useState<any>(null);
    const [successPoints, setSuccessPoints] = useState<number>(0);
    const [successState, setSuccessState] = useState<boolean>(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isBroadcastingRef = useRef<boolean>(false);

    const { generateToken, startAutoRenewal, stopAutoRenewal, secondsLeft, totalDuration, isRenewing } = useProximityToken();

    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';

    const startSharingSession = (url: string) => {
        console.log('Starting sharing session with URL:', url);
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

    const onNewTapDetected = (user: any, points: number) => {
        stopSharingSession();

        haptics.notification('success');

        setSuccessUser(user);
        setSuccessPoints(points);
        setSuccessState(true);

        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const checkNewConnections = async (currentKnownIds: number[]) => {
        try {
            const token = await storage.getItem('access');
            const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (isIrl) {
                // IRL mode: watch for a new entry in irl_taps (keyed by rep row id)
                const taps = res.data.irl_taps || [];
                const newTap = taps.find((t: any) => !currentKnownIds.includes(t.id));
                if (newTap) {
                    onNewTapDetected({
                        username: newTap.username,
                        avatar: newTap.avatar,
                        is_official: newTap.is_official,
                        is_seeker_verified: newTap.is_seeker_verified
                    }, newTap.points || 1);
                    return [...currentKnownIds, newTap.id];
                }
                return currentKnownIds;
            }

            const eventsArray = res.data.events || [];
            const eventData = eventsArray.find((e: any) => e.event_id === Number(eventId));

            if (!eventData) return currentKnownIds;

            const currentConns = eventData.connections || [];
            const newConn = currentConns.find((c: any) => !currentKnownIds.includes(c.user_id));

            if (newConn) {
                onNewTapDetected({
                    username: newConn.username,
                    avatar: newConn.avatar,
                    is_official: newConn.is_official,
                    is_seeker_verified: newConn.is_seeker_verified
                }, newConn.rep_received || 2);
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

        const tokenUrl = await generateToken(
            isIrl ? 'irl' : 'networking',
            isIrl ? undefined : Number(eventId)
        );
        if (tokenUrl) {
            startSharingSession(tokenUrl);
            startAutoRenewal(isIrl ? 'irl' : 'networking', isIrl ? undefined : Number(eventId), (newUrl) => {
                stopSharingSession();
                startSharingSession(newUrl);
            });
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

                if (isIrl) {
                    knownIds = (res.data.irl_taps || []).map((t: any) => t.id);
                    setInitialConnections(knownIds);
                } else {
                    const eventsArray = res.data.events || [];
                    const eventData = eventsArray.find((e: any) => e.event_id === Number(eventId));

                    if (eventData && eventData.connections) {
                        knownIds = eventData.connections.map((c: any) => c.user_id);
                        setInitialConnections(knownIds);
                    }
                }

                if (!active) return;

                const tokenUrl = await generateToken(
                    isIrl ? 'irl' : 'networking',
                    isIrl ? undefined : Number(eventId)
                );
                if (!active || !tokenUrl) return;
                startSharingSession(tokenUrl);

                // Start auto-renewal to keep token fresh
                startAutoRenewal(isIrl ? 'irl' : 'networking', isIrl ? undefined : Number(eventId), (newUrl) => {
                    stopSharingSession();
                    startSharingSession(newUrl);
                });

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

        if (eventId || isIrl) {
            init();
        }

        return () => {
            active = false;
            stopSharingSession();
            stopAutoRenewal();
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [eventId, isIrl]);

    const broadcastLabel = Platform.OS === 'ios' ? 'Bluetooth' : 'NFC';
    const subtitle = isIrl ? 'Not at an event · IRL tap' : null;

    if (!eventId && !isIrl) {
        return (
            <EventScreenShell title="Tap to Meet">
                <View style={styles.centerContent}>
                    <View style={[styles.errorCircle]}>
                        <ShieldX size={48} color={colors.danger} strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.heading, { color: colors.danger }]}>Invalid Event</Text>
                    <Text style={[styles.description, { color: mutedColor }]}>
                        This link is missing its event. Head back and try again.
                    </Text>
                    <View style={styles.ctaWidth}>
                        <EventCta label="Go Back" variant="secondary" onPress={() => router.back()} />
                    </View>
                </View>
            </EventScreenShell>
        );
    }

    return (
        <EventScreenShell title="Tap to Meet" subtitle={subtitle}>
            {!userId ? (
                <CustomActivityIndicator size="large" />
            ) : successState ? (
                <MeetSuccess
                    user={successUser}
                    points={successPoints}
                    actions={
                        <>
                            {FEATURE_PROOF_OF_MEET && (
                                <EventCta
                                    label="Take a selfie together"
                                    variant="secondary"
                                    icon={<Camera size={16} color={isDark ? colors.text : '#111827'} />}
                                    onPress={() => {}}
                                />
                            )}
                            <EventCta
                                label={isIrl ? 'Keep tapping' : 'Continue Networking'}
                                onPress={handleContinue}
                            />
                            <EventCta
                                label="Done"
                                variant="ghost"
                                onPress={() => router.back()}
                            />
                        </>
                    }
                />
            ) : (
                <Animated.View
                    entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                    style={styles.centerContent}
                >
                    <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(100).duration(MOTION.duration.normal)}>
                        <View style={styles.animationContainer}>
                            {!reduceMotion && (
                                <LottieView
                                    autoPlay
                                    loop
                                    style={styles.lottie}
                                    source={require('@/assets/lottie/scanning.json')}
                                />
                            )}
                            <View style={styles.iconCircle}>
                                <Radio size={32} color="#ffffff" />
                            </View>
                        </View>
                    </Animated.View>

                    <Text style={[styles.heading, { color: main }]}>
                        {isIrl ? 'Ready to Tap' : 'Ready to Network'}
                    </Text>
                    <Text style={[styles.description, { color: mutedColor }]}>
                        {isIrl
                            ? `Hold your phone near a friend's phone to meet — you'll both get +1 REP (via ${broadcastLabel}).`
                            : `Hold your phone near another attendee's phone to connect and share reputation via ${broadcastLabel}!`}
                    </Text>

                    <TokenExpiryBadge
                        secondsLeft={secondsLeft}
                        totalDuration={totalDuration}
                        isRenewing={isRenewing}
                        label={isIrl ? 'Active Tap Token' : 'Active Networking Token'}
                    />

                    {Platform.OS === 'ios' ? (
                        <View style={styles.warningCard}>
                            <AlertTriangle size={18} color={colors.accent} style={{ marginBottom: 2 }} />
                            <Text style={[styles.warningTitle, { color: main }]}>iOS Proximity Requirements</Text>
                            <Text style={[styles.warningText, { color: mutedColor }]}>
                                Please ask the other person to enable <Text style={{ fontFamily: 'Dank Mono Bold', color: main }}>Bluetooth</Text> and open the <Text style={{ fontFamily: 'Dank Mono Bold', color: main }}>NextVibe</Text> app on their phone to receive.
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                            <Text style={[styles.infoCardText, { color: mutedColor }]}>
                                Make sure the other person's screen is unlocked.
                            </Text>
                        </View>
                    )}
                </Animated.View>
            )}
        </EventScreenShell>
    );
}

const styles = StyleSheet.create({
    centerContent: {
        alignItems: 'center',
        gap: space.lg,
        width: '100%',
    },
    animationContainer: {
        width: 250,
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        marginBottom: space.xl - space.xs,
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
        backgroundColor: colors.accent,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    errorCircle: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 1.5,
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderColor: 'rgba(248,113,113,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.sm,
    },
    heading: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.title,
        includeFontPadding: false,
        textAlign: 'center',
    },
    description: {
        fontFamily: 'Dank Mono',
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        includeFontPadding: false,
        paddingHorizontal: space.sm + 2,
    },
    infoCard: {
        marginTop: space.xs,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.md,
        width: '100%',
    },
    infoCardText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.mono,
        textAlign: 'center',
    },
    warningCard: {
        marginTop: space.xs,
        paddingHorizontal: space.lg,
        paddingVertical: space.md + 2,
        borderRadius: radius.md,
        borderWidth: 1,
        width: '100%',
        alignItems: 'center',
        gap: space.xs + 2,
        backgroundColor: 'rgba(168,85,247,0.1)',
        borderColor: 'rgba(168,85,247,0.2)',
    },
    warningTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.mono,
        textAlign: 'center',
        includeFontPadding: false,
    },
    warningText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        textAlign: 'center',
        lineHeight: 18,
        includeFontPadding: false,
    },
    ctaWidth: {
        width: '100%',
        marginTop: space.sm,
    },
});
