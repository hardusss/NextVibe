import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ShieldX, Radio, Users } from "lucide-react-native";
import { Image } from "expo-image";
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withSpring,
} from "react-native-reanimated";
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';
import getUserDetail from '@/src/api/user.detail';
import haptics from "@/src/utils/haptics";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";
import { safeBack } from "@/src/utils/safeBack";
import { describeProximityError, ProximityClientError } from "@/src/proximity/errors";
import { getQuickLocation } from "@/src/proximity/location";
import { enqueueProximityLink } from "@/src/proximity/linkQueue";
import { space, colors, type as typeScale } from "@/src/theme/tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import EventScreenShell from "@/components/Events/EventScreenShell";
import EventCta from "@/components/Events/EventCta";
import MeetSuccess from "@/components/Events/MeetSuccess";

// "ready" = we know who's on the other side, waiting for this user's explicit
// confirmation. Nothing is granted to either side before that confirmation.
type ConnectionState = "idle" | "loading" | "ready" | "locating" | "connecting" | "success" | "error";

/**
 * Receive screen for the pre-token link format
 * (`/event-nfc-receive?eventId=…&userId=…`) that old installs may still
 * broadcast. Token links (`?t=…`) are handed to the shared tap prompt.
 */
export default function EventNFCReceiveScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const reduceMotion = useReduceMotion();
    const params = useLocalSearchParams<{
        eventId?: string;
        userId?: string;
        t?: string;
        mode?: string;
        _source?: string;
        _verified?: string;
        _earned_points?: string;
        _username?: string;
        _avatar?: string;
        _is_official?: string;
        _is_seeker_verified?: string;
    }>();
    const eventId = params.eventId ? parseInt(params.eventId, 10) : null;
    const scannedUserId = params.userId ? parseInt(params.userId, 10) : null;
    const proximityToken = params.t || null;
    const irlRequested = params.mode === 'irl' || params._source === 'irl';

    const [state, setState] = useState<ConnectionState>("idle");
    const [message, setMessage] = useState("");
    const [errorTitle, setErrorTitle] = useState("Connection failed");
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [scannedUser, setScannedUser] = useState<any>(null);
    const [isIrlTap, setIsIrlTap] = useState(irlRequested);
    const [meetSlug, setMeetSlug] = useState<string | null>(null);

    // Single in-flight grant: a double-tapped CTA or a re-run of the routing
    // effect must never fire a second verify while one is running.
    const inFlightRef = useRef(false);

    const main = isDark ? colors.text : "#111827";
    const mutedColor = isDark ? colors.sub : "rgba(17,24,39,0.5)";

    // Pulse animation while waiting/connecting
    const pulseScale = useSharedValue(1);
    useEffect(() => {
        const waiting = state === "idle" || state === "loading" || state === "locating" || state === "connecting";
        if (waiting && !reduceMotion) {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.08, { duration: 1200 }),
                    withTiming(1, { duration: 1200 })
                ), -1, true
            );
        } else {
            pulseScale.value = withSpring(1);
        }
    }, [state, reduceMotion]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const showError = (error: unknown) => {
        const info = describeProximityError(error, 'confirm');
        setErrorTitle(info.title);
        setMessage(info.message);
        setState("error");
        haptics.notification('error');
    };

    useEffect(() => {
        if (proximityToken) {
            // One receive experience for every tap: the shared prompt.
            enqueueProximityLink(`/u/e?t=${encodeURIComponent(proximityToken)}`);
            safeBack(router);
            return;
        }
        if (params._verified === "1") {
            setEarnedPoints(params._earned_points ? parseInt(params._earned_points, 10) : 2);
            setScannedUser({
                username: params._username || "Attendee",
                avatar: params._avatar || null,
                is_official: params._is_official === "1",
                is_seeker_verified: params._is_seeker_verified === "1",
            });
            setState("success");
            haptics.notification('success');
        } else if ((eventId || irlRequested) && scannedUserId && state === "idle") {
            handlePeerPreview();
        } else if (state === "idle") {
            setErrorTitle("Invalid tap");
            setMessage("This tap link is incomplete. Ask them to tap again.");
            setState("error");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, scannedUserId, proximityToken, params._verified]);

    const handlePeerPreview = async () => {
        if (!scannedUserId) return;
        setState("loading");
        try {
            const res: any = await getUserDetail(Number(scannedUserId));
            setScannedUser({
                username: res?.username || "Attendee",
                avatar: res?.avatar || res?.avatar_url || null,
                is_official: !!res?.official,
                is_seeker_verified: !!res?.seeker_verified,
            });
        } catch (e) {
            walletLogger.warn(WalletTag.PROXIMITY, 'Peer preview failed');
            setScannedUser(null);
        }
        setState("ready");
    };

    const handleConfirmMeet = () => {
        // EventCta already fires the press haptic.
        handleConnect();
    };

    const handleConnect = async () => {
        if ((!eventId && !irlRequested) || !scannedUserId) {
            setErrorTitle("Invalid tap");
            setMessage("This tap link is incomplete. Ask them to tap again.");
            setState("error");
            return;
        }
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            setState("locating");
            const location = await getQuickLocation({ request: !irlRequested, timeoutMs: 8000 });
            if (location.status === 'mocked') throw new ProximityClientError('mockLocation');
            if (!irlRequested) {
                if (location.status === 'denied') throw new ProximityClientError('locationDenied');
                if (location.status === 'servicesOff') throw new ProximityClientError('locationServicesOff');
            }

            setState("connecting");
            const token = await storage.getItem('access');
            const endpoint = irlRequested ? 'irl-tap' : 'event-nfc-connect';
            const body: any = irlRequested
                ? { scanned_user_id: scannedUserId }
                : { event_id: eventId, scanned_user_id: scannedUserId };
            if (location.status === 'ok') {
                body.latitude = location.latitude;
                body.longitude = location.longitude;
            }
            const response = await axios.post(`${GetApiUrl()}/posts/${endpoint}/`, body, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 12000,
            });

            if (response.data.success) {
                if (response.data.source === 'irl') setIsIrlTap(true);
                setEarnedPoints(response.data.earned_points || 0);
                setScannedUser(response.data.scanned_user);
                setMeetSlug(response.data.meet_slug ?? null);
                setState("success");
                haptics.notification('success');
            } else {
                // A 200 with success:false must not strand the screen in
                // "connecting" — surface it as an error.
                showError({ response: { status: 400, data: response.data } });
            }
        } catch (error: any) {
            walletLogger.error(WalletTag.PROXIMITY, 'Legacy connect failed', error);
            showError(error);
        } finally {
            inFlightRef.current = false;
        }
    };

    const renderContent = () => {
        switch (state) {
            case "idle":
            case "loading":
            case "locating":
            case "connecting":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
                        style={styles.centerContent}
                    >
                        <Animated.View style={[styles.iconCircle, styles.accentCircle, pulseStyle]}>
                            <Radio size={48} color={colors.accent} strokeWidth={1.5} />
                        </Animated.View>

                        <Text style={[styles.heading, { color: main }]}>
                            Tap to Meet
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {state === "locating" ? "Checking your location…" : state === "connecting" ? "Connecting…" : "Loading…"}
                        </Text>
                    </Animated.View>
                );

            case "ready":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
                        style={styles.centerContent}
                    >
                        {scannedUser?.avatar ? (
                            <Image source={{ uri: scannedUser.avatar }} style={styles.confirmAvatar} />
                        ) : (
                            <View style={[styles.iconCircle, styles.accentCircle]}>
                                <Users size={48} color={colors.accent} strokeWidth={1.5} />
                            </View>
                        )}

                        <Text style={[styles.heading, { color: main }]} numberOfLines={1}>
                            {scannedUser?.username ? `Meet @${scannedUser.username}?` : "Confirm this meet?"}
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {earnedPoints > 0
                                ? `Confirm you met in person — you'll both get +${earnedPoints} REP.`
                                : "Confirm you met in person — reputation is added for both of you."}
                        </Text>

                        <View style={styles.ctaWidth}>
                            <EventCta
                                label="Confirm Meet"
                                onPress={handleConfirmMeet}
                            />
                            <EventCta
                                label="Not Now"
                                variant="secondary"
                                onPress={() => safeBack(router)}
                            />
                        </View>
                    </Animated.View>
                );

            case "error":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                        style={styles.centerContent}
                    >
                        <View style={[styles.iconCircle, styles.dangerCircle]}>
                            <ShieldX size={48} color={colors.danger} strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: colors.danger }]}>
                            {errorTitle}
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {message}
                        </Text>

                        <View style={styles.ctaWidth}>
                            {scannedUser && (
                                <EventCta
                                    label="Try Again"
                                    onPress={() => setState("ready")}
                                />
                            )}
                            <EventCta
                                label="Go Back"
                                variant="secondary"
                                onPress={() => safeBack(router)}
                            />
                        </View>
                    </Animated.View>
                );

            case "success":
                return (
                    <MeetSuccess
                        user={scannedUser}
                        points={earnedPoints}
                        meetSlug={meetSlug}
                        atEvent={!isIrlTap}
                        actions={
                            <EventCta
                                label="Awesome"
                                variant={meetSlug ? 'ghost' : 'primary'}
                                onPress={() => safeBack(router)}
                            />
                        }
                    />
                );

            default:
                return null;
        }
    };

    return (
        <EventScreenShell title="Tap to Meet" subtitle={isIrlTap ? 'Not at an event · IRL tap' : null}>
            {renderContent()}
        </EventScreenShell>
    );
}

const styles = StyleSheet.create({
    centerContent: {
        alignItems: "center",
        gap: space.lg,
        width: "100%",
    },
    iconCircle: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 1.5,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: space.sm,
    },
    accentCircle: {
        backgroundColor: "rgba(168,85,247,0.1)",
        borderColor: "rgba(168,85,247,0.2)",
    },
    dangerCircle: {
        backgroundColor: "rgba(248,113,113,0.1)",
        borderColor: "rgba(248,113,113,0.25)",
    },
    heading: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.h2 + 2,
        includeFontPadding: false,
        textAlign: "center",
    },
    description: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        lineHeight: 21,
        textAlign: "center",
        includeFontPadding: false,
        paddingHorizontal: space.sm + 2,
    },
    ctaWidth: {
        width: "100%",
        marginTop: space.sm,
        gap: space.md,
    },
    confirmAvatar: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 3,
        borderColor: colors.accent,
        marginBottom: space.sm,
    },
});
