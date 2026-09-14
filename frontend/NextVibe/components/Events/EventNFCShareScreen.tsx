import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, useColorScheme, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Radio, AlertTriangle, Camera, ShieldX } from 'lucide-react-native';
import { FEATURE_PROOF_OF_MEET } from '@/constants/FeatureFlags';
import LottieView from 'lottie-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import axios from 'axios';
import { startSharing, stopSharing } from '@/modules/nfc-send';
import { startBroadcasting, stopBroadcasting, addBluetoothStateListener, getBluetoothState, BluetoothState } from '@/modules/ble-share';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
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

    // Effective mode after the server resolves it (an 'irl' request from a
    // checked-in user comes back as networking + event). Kept in refs so the
    // polling closure always reads the current values.
    const effectiveIrlRef = useRef<boolean>(isIrl);
    const effectiveEventIdRef = useRef<number | null>(eventId ? Number(eventId) : null);

    const { generateToken, startAutoRenewal, stopAutoRenewal, secondsLeft, totalDuration, isRenewing, resolvedType, resolvedEventId, error: tokenError, getResolvedParams } = useProximityToken();

    const [btState, setBtState] = useState<BluetoothState>('unknown');
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        setBtState(getBluetoothState());
        const sub = addBluetoothStateListener(({ state }) => setBtState(state));
        return () => sub.remove();
    }, []);

    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';

    const startSharingSession = (url: string) => {
        walletLogger.info(WalletTag.PROXIMITY, 'Starting sharing session');
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

    const syncEffectiveMode = () => {
        const params = getResolvedParams();
        if (params) {
            effectiveIrlRef.current = params.interactionType === 'irl';
            effectiveEventIdRef.current = params.eventId ?? null;
        }
    };

    // Snapshot of what's already there in the effective mode, so polling only
    // fires on genuinely new taps/connections.
    const fetchBaseline = async (): Promise<number[]> => {
        const token = await storage.getItem('access');
        const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (effectiveIrlRef.current) {
            return (res.data.irl_taps || []).map((t: any) => t.id);
        }
        const eventsArray = res.data.events || [];
        const eventData = eventsArray.find((e: any) => e.event_id === effectiveEventIdRef.current);
        return (eventData?.connections || []).map((c: any) => c.user_id);
    };

    const checkNewConnections = async (currentKnownIds: number[]) => {
        try {
            const token = await storage.getItem('access');
            const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (effectiveIrlRef.current) {
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
            const eventData = eventsArray.find((e: any) => e.event_id === effectiveEventIdRef.current);

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
            walletLogger.warn(WalletTag.PROXIMITY, 'Polling connections failed');
            return currentKnownIds;
        }
    };

    // Generate (server resolves the real mode) → baseline → broadcast → poll.
    const startSession = async (isActive: () => boolean) => {
        const tokenUrl = await generateToken(
            isIrl ? 'irl' : 'networking',
            isIrl ? undefined : Number(eventId)
        );
        if (!isActive() || !tokenUrl) return;
        syncEffectiveMode();

        let knownIds: number[] = [];
        try {
            knownIds = await fetchBaseline();
        } catch (e) {
            walletLogger.warn(WalletTag.PROXIMITY, 'Baseline fetch failed');
        }
        if (!isActive()) return;
        setInitialConnections(knownIds);

        startSharingSession(tokenUrl);
        // Keep the token fresh; the mode may re-resolve on each rotation.
        startAutoRenewal(isIrl ? 'irl' : 'networking', isIrl ? undefined : Number(eventId), (newUrl) => {
            syncEffectiveMode();
            stopSharingSession();
            startSharingSession(newUrl);
        });

        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }
        pollingRef.current = setInterval(async () => {
            if (!isActive()) return;
            knownIds = await checkNewConnections(knownIds);
            setInitialConnections(knownIds);
        }, 2500);
    };

    const handleContinue = async () => {
        setSuccessState(false);
        setSuccessUser(null);
        setSuccessPoints(0);
        await startSession(() => true);
    };

    useEffect(() => {
        let active = true;

        const init = async () => {
            try {
                const storedId = await storage.getItem('id');
                if (!storedId) {
                    walletLogger.error(WalletTag.PROXIMITY, 'No user ID found in storage');
                    return;
                }
                setUserId(storedId);
                await startSession(() => active);
            } catch (e) {
                walletLogger.error(WalletTag.PROXIMITY, 'Failed to initialize sharing & polling', e);
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
    // Display follows the server-resolved mode once known (an IRL request
    // from a checked-in user broadcasts as event networking).
    const effectiveIrl = resolvedType ? resolvedType === 'irl' : isIrl;
    const subtitle = effectiveIrl
        ? 'Not at an event · IRL tap'
        : (isIrl && resolvedType === 'networking' ? 'Checked in · counts for your event' : null);

    if (tokenError && !successState) {
        return (
            <EventScreenShell title="Tap to Meet">
                <View style={styles.centerContent}>
                    <View style={[styles.errorCircle]}>
                        <ShieldX size={48} color={colors.danger} strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.heading, { color: colors.danger }]}>Can't Start Tapping</Text>
                    <Text style={[styles.description, { color: mutedColor }]}>
                        {tokenError.toLowerCase().includes('check in')
                            ? 'Your event check-in has expired — check in again to network at this event.'
                            : tokenError}
                    </Text>
                    <View style={styles.ctaWidth}>
                        <EventCta label="Go Back" variant="secondary" onPress={() => router.back()} />
                    </View>
                </View>
            </EventScreenShell>
        );
    }

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
                                label={effectiveIrl ? 'Keep tapping' : 'Continue Networking'}
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
                        {effectiveIrl ? 'Ready to Tap' : 'Ready to Network'}
                    </Text>
                    <Text style={[styles.description, { color: mutedColor }]}>
                        {effectiveIrl
                            ? `Hold your phone near a friend's phone to meet — you'll both get +1 REP (via ${broadcastLabel}).`
                            : `Hold your phone near another attendee's phone to connect and share reputation via ${broadcastLabel}!`}
                    </Text>

                    <TokenExpiryBadge
                        secondsLeft={secondsLeft}
                        totalDuration={totalDuration}
                        isRenewing={isRenewing}
                        label={effectiveIrl ? 'Active Tap Token' : 'Active Networking Token'}
                    />

                    {Platform.OS === 'ios' && btState === 'poweredOff' && (
                        <View style={styles.warningCard}>
                            <AlertTriangle size={18} color={colors.accent} style={{ marginBottom: 2 }} />
                            <Text style={[styles.warningTitle, { color: main }]}>Bluetooth is Off</Text>
                            <Text style={[styles.warningText, { color: mutedColor }]}>
                                Turn on Bluetooth to broadcast — sharing resumes automatically.
                            </Text>
                        </View>
                    )}

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
