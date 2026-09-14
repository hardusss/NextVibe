import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ShieldX, Radio } from "lucide-react-native";
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
import * as Location from 'expo-location';
import { verifyProximityToken } from '@/src/api/proximity.token';
import haptics from "@/src/utils/haptics";
import { space, colors, type as typeScale } from "@/src/theme/tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import EventScreenShell from "@/components/Events/EventScreenShell";
import EventCta from "@/components/Events/EventCta";
import MeetSuccess from "@/components/Events/MeetSuccess";

type ConnectionState = "idle" | "locating" | "connecting" | "success" | "error";

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
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [scannedUser, setScannedUser] = useState<any>(null);
    const [isIrlTap, setIsIrlTap] = useState(irlRequested);

    const main = isDark ? colors.text : "#111827";
    const mutedColor = isDark ? colors.sub : "rgba(17,24,39,0.5)";

    // Pulse animation while waiting/connecting
    const pulseScale = useSharedValue(1);
    useEffect(() => {
        const waiting = state === "idle" || state === "locating" || state === "connecting";
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

    useEffect(() => {
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
        } else if (proximityToken && state === "idle") {
            handleTokenConnect();
        } else if ((eventId || irlRequested) && scannedUserId && state === "idle") {
            handleConnect();
        }
    }, [eventId, scannedUserId, proximityToken, params._verified]);

    const handleTokenConnect = async () => {
        if (!proximityToken) {
            setState("error");
            setMessage("Invalid token.");
            return;
        }

        setState("locating");
        // Location is best-effort here: IRL taps don't need it at all, and
        // event taps are rejected server-side when an event requires it.
        let coords: { latitude: number; longitude: number } | null = null;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (location.mocked) {
                    setState("error");
                    setMessage("Fake GPS detected. Real moments only.");
                    haptics.notification('error');
                    return;
                }
                coords = location.coords;
            }
        } catch (e) {
            console.warn("Location error:", e);
        }

        setState("connecting");
        try {
            const result = await verifyProximityToken(
                proximityToken,
                coords?.latitude,
                coords?.longitude
            );

            if (result.success || result.interaction_type === 'networking' || result.interaction_type === 'irl') {
                if (result.source === 'irl' || result.interaction_type === 'irl') setIsIrlTap(true);
                setEarnedPoints(result.earned_points || 0);
                setScannedUser(result.scanned_user || null);
                setState("success");
                haptics.notification('success');
            } else {
                setState("error");
                setMessage(result.error || "Connection failed.");
                haptics.notification('error');
            }
        } catch (error: any) {
            setState("error");
            setMessage(error?.response?.data?.error || "Failed to connect. Please try again.");
            haptics.notification('error');
        }
    };

    const handleConnect = async () => {
        if ((!eventId && !irlRequested) || !scannedUserId) {
            setState("error");
            setMessage("Invalid tap data.");
            return;
        }

        setState("locating");
        let location = null;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                if (!irlRequested) {
                    setState("error");
                    setMessage("Location permission is required to connect with other attendees.");
                    haptics.notification('error');
                    return;
                }
            } else {
                location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (location.mocked) {
                    setState("error");
                    setMessage("Fake GPS detected. Real moments only.");
                    haptics.notification('error');
                    return;
                }
            }
        } catch (e) {
            console.warn("Location error:", e);
            if (!irlRequested) {
                setState("error");
                setMessage("Failed to get location coordinates.");
                haptics.notification('error');
                return;
            }
            location = null;
        }

        setState("connecting");
        try {
            const token = await storage.getItem('access');
            const endpoint = irlRequested ? 'irl-tap' : 'event-nfc-connect';
            const body: any = irlRequested
                ? { scanned_user_id: scannedUserId }
                : { event_id: eventId, scanned_user_id: scannedUserId };
            if (location) {
                body.latitude = location.coords.latitude;
                body.longitude = location.coords.longitude;
            }
            const response = await axios.post(`${GetApiUrl()}/posts/${endpoint}/`, body, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                if (response.data.source === 'irl') setIsIrlTap(true);
                setEarnedPoints(response.data.earned_points || 0);
                setScannedUser(response.data.scanned_user);
                setState("success");
                haptics.notification('success');
            }
        } catch (error: any) {
            setState("error");
            setMessage(error.response?.data?.error || "Failed to connect. Please try again.");
            haptics.notification('error');
        }
    };

    const renderContent = () => {
        switch (state) {
            case "idle":
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
                            Networking...
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {state === "locating" ? "Getting your location..." : "Waiting for reputation..."}
                        </Text>
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
                            Connection Failed
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {message}
                        </Text>

                        <View style={styles.ctaWidth}>
                            <EventCta
                                label="Go Back"
                                variant="secondary"
                                onPress={() => router.back()}
                            />
                        </View>
                    </Animated.View>
                );

            case "success":
                return (
                    <MeetSuccess
                        user={scannedUser}
                        points={earnedPoints}
                        actions={
                            <EventCta
                                label="Awesome"
                                onPress={() => router.back()}
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
    },
});
