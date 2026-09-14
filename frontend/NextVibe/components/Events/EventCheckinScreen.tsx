import React, { useState, useEffect, useRef } from "react";
import {
    StyleSheet,
    Text,
    View,
    useColorScheme,
    AccessibilityInfo,
    Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ShieldCheck, ShieldX, Nfc, Smartphone } from "lucide-react-native";
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
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Device from "expo-device";
import { checkinEvent, claimEventNft } from "@/src/api/event.checkin";
import { verifyProximityToken } from "@/src/api/proximity.token";
import haptics from "@/src/utils/haptics";
import { MOTION } from "@/constants/motion";
import { space, radius, colors, type as typeScale } from "@/src/theme/tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import GlassSurface from "@/components/Shared/GlassSurface";
import GlassBadge from "@/components/Shared/GlassBadge";
import CustomActivityIndicator from "@/components/CustomActivityIndicator";
import SuccessBurst from "@/components/NftClaim/MintBottomSheet/SuccessBurst";
import EventScreenShell from "@/components/Events/EventScreenShell";
import EventCta from "@/components/Events/EventCta";
import MintStatusPill from "@/components/Events/MintStatusPill";

type CheckinState = "idle" | "loading" | "verified" | "not_registered" | "error";
type MintStatus = "idle" | "minting" | "success" | "failed";

export default function EventCheckinScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const reduceMotion = useReduceMotion();
    const params = useLocalSearchParams<{
        postId?: string;
        t?: string;
        _verified?: string;
        _post_id?: string;
        _post_name?: string;
        _message?: string;
        _post_image?: string;
        _username?: string;
    }>();
    const postId = params.postId ? parseInt(params.postId, 10) : null;
    const proximityToken = params.t || null;

    const [state, setState] = useState<CheckinState>("idle");
    const [message, setMessage] = useState("");
    const [postImage, setPostImage] = useState<string | null>(null);
    const [postName, setPostName] = useState<string>("");
    const [resolvedPostId, setResolvedPostId] = useState<number | null>(null);
    const [mintStatus, setMintStatus] = useState<MintStatus>("idle");
    const [mintError, setMintError] = useState<string | null>(null);
    const [earnedPoints, setEarnedPoints] = useState(0);

    const effectivePostId = postId ?? resolvedPostId;
    const mintStartedRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const main = isDark ? colors.text : "#111827";
    const mutedColor = isDark ? colors.sub : "rgba(17,24,39,0.5)";
    const canTapToMeet = Device.isDevice;

    // Idle NFC pulse
    const pulseScale = useSharedValue(1);
    useEffect(() => {
        if (state === "idle" && !reduceMotion) {
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
            setPostName(params._post_name || "Event");
            setMessage(params._message || "You're verified! Welcome to the event.");
            setPostImage(params._post_image || null);
            if (params._post_id) {
                const parsed = parseInt(params._post_id, 10);
                if (!Number.isNaN(parsed)) setResolvedPostId(parsed);
            }
            setState("verified");
            haptics.notification('success');
        } else if (params._verified === "0") {
            setPostName(params._post_name || "Event");
            setMessage(params._message || "You are not registered for this event.");
            setPostImage(params._post_image || null);
            setState("not_registered");
            haptics.notification('error');
        } else if ((postId || proximityToken) && state === "idle") {
            handleVerify();
        }
    }, [postId, proximityToken, params._verified]);

    // Lazy mint: fire once as soon as we're verified and know the event.
    useEffect(() => {
        if (state === "verified" && effectivePostId && !mintStartedRef.current) {
            mintStartedRef.current = true;
            startMint(effectivePostId);
        }
    }, [state, effectivePostId]);

    const handleVerify = async () => {
        if (!postId && !proximityToken) {
            setState("error");
            setMessage("Invalid event link.");
            return;
        }

        setState("loading");
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setState("error");
                setMessage("Location permission is required to check in to this event.");
                haptics.notification('error');
                return;
            }

            const locData = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (locData.mocked) {
                setState("error");
                setMessage("Fake GPS detected. Real moments only.");
                haptics.notification('error');
                return;
            }

            let result: any;
            if (proximityToken) {
                result = await verifyProximityToken(proximityToken, locData.coords.latitude, locData.coords.longitude);
            } else if (postId) {
                result = await checkinEvent(postId, {
                    lat: locData.coords.latitude,
                    lng: locData.coords.longitude
                });
            }

            if (result.verified || result.interaction_type === 'checkin') {
                if (result.post_image) {
                    setPostImage(result.post_image.startsWith("http") ? result.post_image : `https://nextvibe.s3.amazonaws.com/${result.post_image}`);
                }
                if (result.post_id) setResolvedPostId(result.post_id);
                setPostName(result.post_name || "Event");
                setState("verified");
                setMessage("You're verified! Welcome to the event.");
                haptics.notification('success');
            } else {
                setState("not_registered");
                setMessage(result.message || result.error || "You are not registered for this event.");
                haptics.notification('error');
            }
        } catch (error: any) {
            setState("error");
            if (error.response?.status === 401) {
                setMessage("Please log in to verify your attendance.");
            } else if (error.response?.status === 404) {
                setMessage("Event not found.");
            } else {
                setMessage(error.response?.data?.error || "Something went wrong. Please try again.");
            }
            haptics.notification('error');
        }
    };

    const startMint = async (targetPostId: number) => {
        setMintStatus("minting");
        setMintError(null);
        AccessibilityInfo.announceForAccessibility?.("Minting your event NFT");
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (!mountedRef.current) return;
            if (status !== 'granted') {
                setMintStatus("failed");
                setMintError("Location permission is required to mint.");
                haptics.notification('error');
                return;
            }

            const locData = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (!mountedRef.current) return;
            if (locData.mocked) {
                setMintStatus("failed");
                setMintError("Fake GPS detected. Real moments only.");
                haptics.notification('error');
                return;
            }

            const result = await claimEventNft(targetPostId, {
                lat: locData.coords.latitude,
                lng: locData.coords.longitude
            });
            if (!mountedRef.current) return;
            if (result.success) {
                setEarnedPoints(result.earned_points || 0);
                setMintStatus("success");
                haptics.notification('success');
                AccessibilityInfo.announceForAccessibility?.(
                    `Event NFT minted. Plus ${result.earned_points || 0} reputation points.`
                );
            } else {
                setMintStatus("failed");
                setMintError(result.error || "You're checked in — the POAP mint failed. Tap to retry.");
                haptics.notification('error');
            }
        } catch (error: any) {
            if (!mountedRef.current) return;
            const serverError: string | undefined = error.response?.data?.error;
            // Legacy one-per-user guard (the backend now returns 200 with
            // already_owned instead — this covers un-updated servers).
            if (serverError && serverError.toLowerCase().includes("already have")) {
                setEarnedPoints(0);
                setMintStatus("success");
                return;
            }
            setMintStatus("failed");
            // The check-in and its reputation are already recorded server-side;
            // only the mint needs retrying.
            setMintError(serverError || "You're checked in — the POAP mint failed. Tap to retry.");
            haptics.notification('error');
        }
    };

    const handleTapToMeet = () => {
        if (effectivePostId) {
            router.push(`/event-nfc-share?eventId=${effectivePostId}` as any);
        } else {
            router.push("/event-nfc-share?mode=irl" as any);
        }
    };

    const enter = (delay: number) =>
        reduceMotion ? undefined : FadeInDown.delay(delay).duration(MOTION.duration.normal);

    const renderContent = () => {
        switch (state) {
            case "idle":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
                        style={styles.centerContent}
                    >
                        <Animated.View style={[styles.iconCircle, styles.accentCircle, pulseStyle]}>
                            <Nfc size={48} color={colors.accent} strokeWidth={1.5} />
                        </Animated.View>

                        <Text style={[styles.heading, { color: main }]}>
                            Event Check-in
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            Tap the button below to verify your attendance at this event.
                        </Text>

                        <View style={styles.ctaWidth}>
                            <EventCta
                                label="Verify Attendance"
                                icon={<ShieldCheck size={20} color={colors.text} strokeWidth={1.8} />}
                                onPress={handleVerify}
                            />
                        </View>
                    </Animated.View>
                );

            case "loading":
                return (
                    <View style={styles.centerContent}>
                        <CustomActivityIndicator size="large" />
                        <Text style={[styles.loadingText, { color: mutedColor }]}>
                            Verifying...
                        </Text>
                    </View>
                );

            case "verified":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                        style={styles.verifiedWrap}
                    >
                        <View style={styles.verifiedBody}>
                            <Animated.View entering={enter(0)}>
                                <View style={styles.imageGlow}>
                                    {!reduceMotion && (
                                        <SuccessBurst trigger={mintStatus === "success"} color={colors.success} />
                                    )}
                                    {postImage ? (
                                        <GlassSurface
                                            style={styles.eventPhotoCard}
                                            glassEffectStyle="regular"
                                            colorScheme={isDark ? "dark" : "light"}
                                        >
                                            <Image
                                                source={{ uri: postImage }}
                                                style={styles.eventPhoto}
                                                contentFit="cover"
                                            />
                                        </GlassSurface>
                                    ) : (
                                        <View style={[styles.iconCircle, styles.successCircle]}>
                                            <ShieldCheck size={48} color={colors.success} strokeWidth={1.5} />
                                        </View>
                                    )}
                                </View>
                            </Animated.View>

                            <Animated.View entering={enter(120)}>
                                <GlassBadge variant="feed-event" feedLight={!isDark}>
                                    <ShieldCheck size={14} color={colors.success} />
                                    <Text style={styles.badgeText}>Checked in</Text>
                                </GlassBadge>
                            </Animated.View>

                            <Animated.Text entering={enter(240)} style={[styles.eventName, { color: main }]}>
                                {postName}
                            </Animated.Text>
                            <Animated.Text entering={enter(360)} style={[styles.description, { color: mutedColor }]}>
                                {message}
                            </Animated.Text>

                            {effectivePostId != null && mintStatus !== "idle" && (
                                <Animated.View entering={enter(480)} style={styles.pillWrap}>
                                    <MintStatusPill
                                        status={mintStatus}
                                        points={earnedPoints}
                                        error={mintError}
                                        onRetry={() => startMint(effectivePostId)}
                                    />
                                </Animated.View>
                            )}
                        </View>

                        <Animated.View
                            entering={reduceMotion ? undefined : FadeInUp.delay(500).duration(MOTION.duration.normal)}
                            style={styles.ctaBlock}
                        >
                            <EventCta
                                label="Tap To Meet"
                                icon={<Smartphone size={18} color={colors.text} />}
                                onPress={handleTapToMeet}
                                disabled={!canTapToMeet}
                                accessibilityLabel="Tap to meet people at this event"
                            />
                            {!canTapToMeet && (
                                <Text style={[styles.simNote, { color: mutedColor }]} numberOfLines={1}>
                                    Tap to Meet needs a physical device with NFC or Bluetooth.
                                </Text>
                            )}
                            <EventCta
                                label="Done"
                                variant="secondary"
                                onPress={() => router.back()}
                            />
                        </Animated.View>
                    </Animated.View>
                );

            case "not_registered":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                        style={styles.centerContent}
                    >
                        <View style={[styles.iconCircle, styles.dangerCircle]}>
                            <ShieldX size={48} color={colors.danger} strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: colors.danger }]}>
                            Not Registered
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

            case "error":
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
                        style={styles.centerContent}
                    >
                        <View style={[styles.iconCircle, styles.warningCircle]}>
                            <ShieldX size={48} color={colors.warning} strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: colors.warning }]}>
                            Error
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {message}
                        </Text>

                        <View style={styles.errorActions}>
                            <View style={{ flex: 1 }}>
                                <EventCta
                                    label="Retry"
                                    onPress={() => { setState("idle"); setMessage(""); }}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <EventCta
                                    label="Go Back"
                                    variant="secondary"
                                    onPress={() => router.back()}
                                />
                            </View>
                        </View>
                    </Animated.View>
                );
        }
    };

    return (
        <EventScreenShell title="Event Check-in">
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
    verifiedWrap: {
        flex: 1,
        width: "100%",
    },
    verifiedBody: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: space.lg,
        width: "100%",
    },
    imageGlow: {
        alignItems: "center",
        justifyContent: "center",
        ...Platform.select({
            ios: {
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 24,
            },
            android: {
                elevation: 0,
            },
        }),
    },
    eventPhotoCard: {
        width: 160,
        height: 160,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        ...Platform.select({
            android: { elevation: 8 },
        }),
    },
    eventPhoto: {
        width: "100%",
        height: "100%",
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
    successCircle: {
        backgroundColor: "rgba(74,222,128,0.1)",
        borderColor: "rgba(74,222,128,0.25)",
    },
    dangerCircle: {
        backgroundColor: "rgba(248,113,113,0.1)",
        borderColor: "rgba(248,113,113,0.25)",
    },
    warningCircle: {
        backgroundColor: "rgba(251,191,36,0.1)",
        borderColor: "rgba(251,191,36,0.25)",
    },
    badgeText: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        color: colors.success,
        includeFontPadding: false,
    },
    heading: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.h2 + 2,
        includeFontPadding: false,
        textAlign: "center",
    },
    eventName: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.title,
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
    loadingText: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        marginTop: space.md,
        includeFontPadding: false,
    },
    pillWrap: {
        marginTop: space.xs,
        maxWidth: "100%",
    },
    ctaBlock: {
        width: "100%",
        gap: space.md,
        paddingBottom: space.sm,
    },
    ctaWidth: {
        width: "100%",
        marginTop: space.sm,
    },
    simNote: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption,
        includeFontPadding: false,
        textAlign: "center",
        marginTop: -space.xs,
    },
    errorActions: {
        flexDirection: "row",
        gap: space.sm + 2,
        width: "100%",
        marginTop: space.sm,
    },
});
