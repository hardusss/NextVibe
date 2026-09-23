import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { CheckCircle2, Radio, ShieldX, WifiOff } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import GetApiUrl from '@/src/utils/url_api';
import { safeBack } from '@/src/utils/safeBack';
import { requestScanStart } from '@/src/utils/bleScanController';
import { useProximityToken } from '@/hooks/useProximityToken';
import { useProximityBroadcast } from '@/hooks/useProximityBroadcast';
import { useProximityReadiness } from '@/hooks/useProximityReadiness';
import { useProximityPrompt } from '@/src/proximity/promptStore';
import { describeProximityError } from '@/src/proximity/errors';
import { warmUpLocation } from '@/src/proximity/location';
import haptics from '@/src/utils/haptics';
import { MOTION } from '@/constants/motion';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import CustomActivityIndicator from '@/components/CustomActivityIndicator';
import EventScreenShell from '@/components/Events/EventScreenShell';
import EventCta from '@/components/Events/EventCta';
import MeetSuccess, { type MeetUser } from '@/components/Events/MeetSuccess';
import ReadinessCard from '@/components/Proximity/ReadinessCard';
import HowToTapCard from '@/components/Proximity/HowToTapCard';
import ShareChannelSwitch from '@/components/Proximity/ShareChannelSwitch';
import TapQrCode from '@/components/Proximity/TapQrCode';
import { useShareChannel } from '@/hooks/useShareChannel';

type Phase = 'starting' | 'live' | 'failed' | 'success';

// Keyed across every mode: a meet can land as an IRL tap or under any event,
// whatever this screen was opened for (the other person's code decides).
type ConnectionEntry = {
    key: string;
    user: MeetUser & { user_id?: number };
    points: number;
    /** Its Proof of Meet (missing only for meets from before slugs). */
    meetSlug: string | null;
    atEvent: boolean;
};

const POLL_MS = 2500;
const FAST_POLL_MS = 1000;
// After someone reads this phone, poll quickly while they decide.
const FAST_POLL_WINDOW_MS = 25_000;
// How long "they picked you up" stays on screen without a confirmation.
const READ_NOTICE_MS = 20_000;
// The baseline decides what counts as a new meet — worth a couple of retries
// on shaky venue Wi-Fi before going live.
const BASELINE_RETRY_DELAYS_MS = [800, 2000];

/**
 * Tap to Meet. This phone both broadcasts its tap code (Bluetooth, plus an
 * NFC tag on Android) and listens for the other person's, so it works no
 * matter which of the two opened the screen — or if both did.
 */
export default function EventNFCShareScreen() {
    useKeepAwake();
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const params = useLocalSearchParams<{ eventId?: string; mode?: string }>();
    const eventId = params.eventId;
    const isIrl = params.mode === 'irl';

    const [phase, setPhase] = useState<Phase>('starting');
    const [successUser, setSuccessUser] = useState<MeetUser | null>(null);
    const [successPoints, setSuccessPoints] = useState(0);
    const [successMeet, setSuccessMeet] = useState<{ slug: string | null; atEvent: boolean }>({ slug: null, atEvent: false });
    const [pickedUp, setPickedUp] = useState(false);

    const mountedRef = useRef(true);
    const sessionRef = useRef(0);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollInFlightRef = useRef(false);
    const knownIdsRef = useRef<string[] | null>(null);
    const fastPollUntilRef = useRef(0);
    const pickedUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Effective mode after the server resolves it (an 'irl' request from a
    // checked-in user comes back as networking + event).
    const effectiveIrlRef = useRef<boolean>(isIrl);
    const effectiveEventIdRef = useRef<number | null>(eventId ? Number(eventId) : null);

    const tokenApi = useProximityToken();
    const {
        generateToken, startAutoRenewal, stopAutoRenewal, renewNow, getResolvedParams, tokenUrl,
        resolvedType, renewalFailing, isStale, errorObject,
    } = tokenApi;

    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    // ── Connections polling (how the broadcaster learns the other side confirmed) ──

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const readEntries = (data: any): ConnectionEntry[] => {
        const irl: ConnectionEntry[] = (data?.irl_taps || []).map((t: any) => ({
            key: `irl:${t.id}`,
            user: {
                user_id: t.user_id,
                username: t.username,
                avatar: t.avatar,
                is_official: t.is_official,
                is_seeker_verified: t.is_seeker_verified,
            },
            points: t.points || 1,
            meetSlug: t.meet_slug ?? null,
            atEvent: false,
        }));
        const events: ConnectionEntry[] = (data?.events || []).flatMap((e: any) =>
            (e?.connections || []).map((c: any) => ({
                key: `ev:${e.event_id}:${c.user_id}`,
                user: {
                    user_id: c.user_id,
                    username: c.username,
                    avatar: c.avatar,
                    is_official: c.is_official,
                    is_seeker_verified: c.is_seeker_verified,
                },
                points: c.rep_received || 2,
                meetSlug: c.meet_slug ?? null,
                atEvent: true,
            }))
        );
        return [...irl, ...events];
    };

    const fetchEntries = async (): Promise<ConnectionEntry[]> => {
        const access = await storage.getItem('access');
        const res = await axios.get(`${GetApiUrl()}/posts/user-event-connections/`, {
            headers: { Authorization: `Bearer ${access}` },
            timeout: 10000,
        });
        return readEntries(res.data);
    };

    const finishWithMeet = useCallback((entry: ConnectionEntry) => {
        sessionRef.current++;
        stopPolling();
        stopAutoRenewal();
        broadcastStopRef.current();
        const { lastMet } = useProximityPrompt.getState();
        const confirmedHere = !!lastMet && lastMet.userId === entry.user.user_id && Date.now() - lastMet.at < 10_000;
        if (!confirmedHere) haptics.notification('success');
        useProximityPrompt.getState().reportMet(entry.user.user_id ?? null);
        setPickedUp(false);
        setSuccessUser(entry.user);
        setSuccessPoints(entry.points);
        setSuccessMeet({ slug: entry.meetSlug, atEvent: entry.atEvent });
        setPhase('success');
        walletLogger.info(WalletTag.PROXIMITY, 'Meet confirmed', { kind: entry.key.split(':')[0] });
    }, [stopPolling, stopAutoRenewal]);

    const pollOnce = useCallback(async (session: number) => {
        if (pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try {
            const entries = await fetchEntries();
            if (!mountedRef.current || session !== sessionRef.current) return;
            const keys = entries.map((e) => e.key);
            if (knownIdsRef.current === null) {
                // Baseline wasn't available at start — establish it now instead
                // of treating every old connection as a new meet.
                knownIdsRef.current = keys;
                return;
            }
            const known = new Set(knownIdsRef.current);
            const fresh = entries.find((e) => !known.has(e.key));
            if (fresh) {
                knownIdsRef.current = keys;
                finishWithMeet(fresh);
            }
        } catch {
            walletLogger.warn(WalletTag.PROXIMITY, 'Polling connections failed');
        } finally {
            pollInFlightRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finishWithMeet]);

    const schedulePoll = useCallback((session: number, delay?: number) => {
        stopPolling();
        const wait = delay ?? (Date.now() < fastPollUntilRef.current ? FAST_POLL_MS : POLL_MS);
        pollTimerRef.current = setTimeout(async () => {
            if (!mountedRef.current || session !== sessionRef.current) return;
            await pollOnce(session);
            if (mountedRef.current && session === sessionRef.current) schedulePoll(session);
        }, wait);
    }, [pollOnce, stopPolling]);

    // ── Broadcast ──

    const onPickedUp = useCallback(() => {
        if (!mountedRef.current) return;
        haptics.impact('rigid');
        setPickedUp(true);
        fastPollUntilRef.current = Date.now() + FAST_POLL_WINDOW_MS;
        if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
        pickedUpTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setPickedUp(false);
        }, READ_NOTICE_MS);
        schedulePoll(sessionRef.current, 300);
    }, [schedulePoll]);

    const shareChannel = useShareChannel();
    const broadcast = useProximityBroadcast({ onRead: onPickedUp, channels: shareChannel.broadcastChannels });
    const broadcastStopRef = useRef(broadcast.stop);
    broadcastStopRef.current = broadcast.stop;

    const readiness = useProximityReadiness({
        role: 'both',
        channels: shareChannel.broadcastChannels,
        onFixed: () => {
            broadcast.restart();
            requestScanStart({ prompt: false });
        },
    });

    const syncEffectiveMode = useCallback(() => {
        const resolved = getResolvedParams();
        if (resolved) {
            effectiveIrlRef.current = resolved.interactionType === 'irl';
            effectiveEventIdRef.current = resolved.eventId ?? null;
        }
    }, [getResolvedParams]);

    // Generate (server resolves the real mode) → baseline → broadcast → listen → poll.
    const startSession = useCallback(async () => {
        const session = ++sessionRef.current;
        const alive = () => mountedRef.current && session === sessionRef.current;
        setPhase('starting');
        setPickedUp(false);

        const url = await generateToken(isIrl ? 'irl' : 'networking', isIrl ? undefined : Number(eventId));
        if (!alive()) return;
        if (!url) {
            setPhase('failed');
            haptics.notification('error');
            return;
        }
        syncEffectiveMode();

        knownIdsRef.current = null;
        for (let attempt = 0; attempt <= BASELINE_RETRY_DELAYS_MS.length; attempt++) {
            try {
                knownIdsRef.current = (await fetchEntries()).map((e) => e.key);
                break;
            } catch {
                if (attempt === BASELINE_RETRY_DELAYS_MS.length || !alive()) break;
                await new Promise((resolve) => setTimeout(resolve, BASELINE_RETRY_DELAYS_MS[attempt]));
            }
        }
        if (!alive()) return;

        await broadcast.start(url);
        if (!alive()) return;
        // Listen too: if the other person also opened Tap to Meet, this
        // phone picks up their code and asks to confirm. (iOS: the permission
        // sheet is already up from broadcasting — starting the scanner joins
        // it. Android already asked for the superset above.)
        requestScanStart({ prompt: Platform.OS === 'ios' });

        startAutoRenewal(isIrl ? 'irl' : 'networking', isIrl ? undefined : Number(eventId), (newUrl) => {
            syncEffectiveMode();
            broadcast.update(newUrl);
        });
        setPhase('live');
        schedulePoll(session);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, isIrl, generateToken, startAutoRenewal, syncEffectiveMode, schedulePoll, broadcast.start, broadcast.update]);

    useEffect(() => {
        mountedRef.current = true;
        // The screen listens with the normal (close-range) sensitivity. The
        // looser "active" mode (−62 dBm) picked up phones 30 cm+ away and
        // prompted several nearby phones at once.
        warmUpLocation();
        if (eventId || isIrl) startSession();

        return () => {
            mountedRef.current = false;
            sessionRef.current++;
            stopPolling();
            stopAutoRenewal();
            if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, isIrl]);

    // The prompt hands its success moment to this screen only while this
    // screen can actually show it: live, and not covered by another screen.
    const isFocused = useIsFocused();
    useEffect(() => {
        if (phase !== 'live' || !isFocused) return;
        useProximityPrompt.getState().setShareScreenActive(true);
        return () => useProximityPrompt.getState().setShareScreenActive(false);
    }, [phase, isFocused]);

    // Timers are paused in the background: refresh the code and check for a
    // meet that happened meanwhile as soon as the app is back.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next !== 'active' || phase !== 'live') return;
            renewNow();
            schedulePoll(sessionRef.current, 0);
        });
        return () => sub.remove();
    }, [phase, renewNow, schedulePoll]);

    // This phone confirmed a meet in the prompt — check right away.
    const lastMetAt = useProximityPrompt((s) => s.lastMet?.at);
    useEffect(() => {
        if (lastMetAt && phase === 'live') schedulePoll(sessionRef.current, 0);
    }, [lastMetAt, phase, schedulePoll]);

    const handleContinue = () => {
        setSuccessUser(null);
        setSuccessPoints(0);
        setSuccessMeet({ slug: null, atEvent: false });
        startSession();
    };

    // ── Render ──

    const effectiveIrl = resolvedType ? resolvedType === 'irl' : isIrl;
    const subtitle = effectiveIrl
        ? 'In person · not at an event'
        : (isIrl && resolvedType === 'networking' ? 'Checked in · counts for your event' : 'Event networking');

    if (!eventId && !isIrl) {
        return (
            <EventScreenShell title="Tap to Meet">
                <View style={styles.centerContent}>
                    <View style={[styles.stateCircle, styles.dangerCircle]}>
                        <ShieldX size={44} color={colors.danger} strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.heading, { color: main }]}>Invalid event</Text>
                    <Text style={[styles.description, { color: mutedColor }]}>
                        This link is missing its event. Head back and try again.
                    </Text>
                    <View style={styles.ctaBlock}>
                        <EventCta label="Go Back" variant="secondary" onPress={() => safeBack(router)} />
                    </View>
                </View>
            </EventScreenShell>
        );
    }

    if (phase === 'success') {
        return (
            <EventScreenShell title="Tap to Meet" subtitle={subtitle}>
                <MeetSuccess
                    user={successUser}
                    points={successPoints}
                    meetSlug={successMeet.slug}
                    atEvent={successMeet.atEvent}
                    actions={
                        <>
                            <EventCta
                                label={effectiveIrl ? 'Keep tapping' : 'Continue networking'}
                                variant={successMeet.slug ? 'secondary' : 'primary'}
                                onPress={handleContinue}
                            />
                            <EventCta label="Done" variant="ghost" onPress={() => safeBack(router)} />
                        </>
                    }
                />
            </EventScreenShell>
        );
    }

    if (phase === 'failed') {
        const error = describeProximityError(errorObject, 'generate');
        return (
            <EventScreenShell title="Tap to Meet" subtitle={subtitle}>
                <Animated.View
                    entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                    style={styles.centerContent}
                >
                    <View style={[styles.stateCircle, error.tone === 'error' ? styles.dangerCircle : styles.warningCircle]}>
                        {error.kind === 'network' || error.kind === 'timeout'
                            ? <WifiOff size={44} color={colors.warning} strokeWidth={1.5} />
                            : <ShieldX size={44} color={error.tone === 'error' ? colors.danger : colors.warning} strokeWidth={1.5} />}
                    </View>
                    <Text style={[styles.heading, { color: main }]}>{error.title}</Text>
                    <Text style={[styles.description, { color: mutedColor }]}>{error.message}</Text>
                    <View style={styles.ctaBlock}>
                        {error.action === 'goIrl' && (
                            <EventCta
                                label="Meet outside the event"
                                onPress={() => router.replace('/event-nfc-share?mode=irl' as any)}
                            />
                        )}
                        {error.retryable && <EventCta label="Try again" onPress={startSession} />}
                        <EventCta
                            label="Go Back"
                            variant={error.action === 'goIrl' || error.retryable ? 'ghost' : 'secondary'}
                            onPress={() => safeBack(router)}
                        />
                    </View>
                </Animated.View>
            </EventScreenShell>
        );
    }

    const starting = phase === 'starting';
    const statusTone: 'live' | 'warn' | 'off' | 'blocked' | 'starting' = starting
        ? 'starting'
        : readiness.blocking ? 'blocked' : isStale ? 'off' : renewalFailing ? 'warn' : 'live';
    const qrMode = shareChannel.channel === 'qr';
    const statusLabel = {
        starting: 'Getting ready…',
        live: qrMode ? 'Live — the code is ready to scan' : 'Live — others nearby can tap you',
        warn: 'Connection is shaky — still live',
        off: 'Offline — your tap code expired',
        blocked: 'Not live — fix the item below',
    }[statusTone];
    const statusColor = {
        starting: colors.accent, live: colors.success, warn: colors.warning, off: colors.danger, blocked: colors.danger,
    }[statusTone];

    const heading = qrMode
        ? 'Show this code'
        : pickedUp
            ? 'They picked you up'
            : readiness.blocking ? 'Almost ready' : effectiveIrl ? 'Ready to tap' : 'Ready to network';
    const description = qrMode
        ? 'Ask them to scan it with their phone’s camera.'
        : pickedUp
            ? 'Waiting for them to confirm on their phone…'
            : shareChannel.channel === 'nfc' && Platform.OS === 'android'
                ? 'Touch the back of your phone to theirs.'
                : 'Hold your phone back to back with theirs for a second.';

    return (
        <EventScreenShell title="Tap to Meet" subtitle={subtitle} bodyStyle={styles.shellBody}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View
                    entering={reduceMotion ? undefined : FadeInDown.delay(60).duration(MOTION.duration.normal)}
                    style={styles.hero}
                >
                    {qrMode ? (
                        <View style={styles.qrContainer}>
                            <TapQrCode value={starting ? null : tokenUrl} caption="Refreshes automatically" />
                        </View>
                    ) : (
                        <View style={styles.animationContainer}>
                            {!reduceMotion && !starting && (
                                <LottieView
                                    autoPlay
                                    loop
                                    style={styles.lottie}
                                    source={require('@/assets/lottie/scanning.json')}
                                />
                            )}
                            <View style={[styles.iconCircle, pickedUp && styles.iconCircleActive]}>
                                {starting
                                    ? <CustomActivityIndicator size="small" />
                                    : pickedUp
                                        ? <CheckCircle2 size={34} color="#ffffff" />
                                        : <Radio size={32} color="#ffffff" />}
                            </View>
                        </View>
                    )}

                    <Text style={[styles.heading, { color: main }]} accessibilityLiveRegion="polite">{heading}</Text>
                    <Text style={[styles.description, { color: mutedColor }]}>{description}</Text>

                    <View
                        style={[
                            styles.statusPill,
                            { borderColor: `${statusColor}55`, backgroundColor: `${statusColor}14` },
                        ]}
                    >
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: main }]}>{statusLabel}</Text>
                    </View>

                    <ShareChannelSwitch
                        channel={shareChannel.channel}
                        onChange={shareChannel.setPreference}
                        canChoose={shareChannel.canChoose}
                    />
                </Animated.View>

                {isStale && (
                    <View style={styles.ctaInline}>
                        <EventCta label="Reconnect" variant="secondary" onPress={startSession} />
                    </View>
                )}

                <ReadinessCard issues={readiness.issues} />

                {broadcast.broadcastError && shareChannel.channel === 'bluetooth' && !readiness.issues.some((i) => i.id.startsWith('bluetooth')) && (
                    <Text style={[styles.footnote, { color: mutedColor }]}>
                        {broadcast.broadcastError.code === 'unsupported'
                            ? (Platform.OS === 'android' && shareChannel.canChoose
                                ? "This phone can't broadcast over Bluetooth — switch to NFC above, or pick up their phone instead."
                                : "This phone can't broadcast over Bluetooth — ask them to open Tap to Meet so your phone picks up theirs.")
                            : 'Bluetooth broadcasting hit a snag. If nothing happens, turn Bluetooth off and on again.'}
                    </Text>
                )}

                <HowToTapCard audience={effectiveIrl ? 'friend' : 'attendee'} channel={shareChannel.channel} />
            </ScrollView>
        </EventScreenShell>
    );
}

const styles = StyleSheet.create({
    shellBody: {
        justifyContent: 'flex-start',
        paddingHorizontal: 0,
        paddingBottom: 0,
    },
    scroll: {
        width: '100%',
    },
    scrollContent: {
        paddingHorizontal: space.lg + 4,
        paddingBottom: space.xxl,
        alignItems: 'center',
    },
    hero: {
        alignItems: 'center',
        width: '100%',
        paddingTop: space.md,
    },
    centerContent: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    qrContainer: {
        marginBottom: space.lg,
        marginTop: space.sm,
    },
    animationContainer: {
        width: 200,
        height: 200,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.md,
    },
    lottie: {
        position: 'absolute',
        width: 280,
        height: 280,
    },
    iconCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 8,
    },
    iconCircleActive: {
        backgroundColor: '#22c55e',
        shadowColor: '#22c55e',
    },
    stateCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.lg,
    },
    dangerCircle: {
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderColor: 'rgba(248,113,113,0.25)',
    },
    warningCircle: {
        backgroundColor: 'rgba(251,191,36,0.1)',
        borderColor: 'rgba(251,191,36,0.25)',
    },
    heading: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.title,
        lineHeight: typeScale.title + 4,
        textAlign: 'center',
        includeFontPadding: false,
    },
    description: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        marginTop: space.sm,
        paddingHorizontal: space.md,
        includeFontPadding: false,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 6,
        marginTop: space.lg,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
    ctaBlock: {
        width: '100%',
        gap: space.md,
        marginTop: space.xl,
        paddingHorizontal: space.sm,
    },
    ctaInline: {
        width: '100%',
        marginTop: space.md,
    },
    footnote: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        lineHeight: typeScale.caption + 5,
        textAlign: 'center',
        marginTop: space.md,
        includeFontPadding: false,
    },
});
