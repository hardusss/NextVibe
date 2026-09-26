import React, { useState, useEffect, useRef } from "react";
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    useColorScheme,
    useWindowDimensions,
    AccessibilityInfo,
    Linking,
    Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ShieldCheck, ShieldX, Nfc, Smartphone, BadgeCheck } from "lucide-react-native";
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
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Device from "expo-device";
import { checkinEvent, claimEventNft } from "@/src/api/event.checkin";
import { verifyProximityToken } from "@/src/api/proximity.token";
import haptics from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/safeBack";
import { describeProximityError, ProximityClientError, type ProximityErrorAction } from "@/src/proximity/errors";
import { getQuickLocation } from "@/src/proximity/location";
import { MOTION } from "@/constants/motion";
import { space, radius, colors, type as typeScale } from "@/src/theme/tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import CustomActivityIndicator from "@/components/CustomActivityIndicator";
import SuccessBurst from "@/components/NftClaim/MintBottomSheet/SuccessBurst";
import EventScreenShell from "@/components/Events/EventScreenShell";
import EventCta from "@/components/Events/EventCta";
import MintStatusPill from "@/components/Events/MintStatusPill";
import SavedOffchainNote from "@/components/Collectibles/SavedOffchainNote";
import { getCollectible } from "@/src/api/collectibles";
import { useCollectibles } from "@/src/stores/collectiblesStore";

type CheckinState = "idle" | "loading" | "verified" | "not_registered" | "error";
type MintStatus = "idle" | "minting" | "success" | "saved" | "failed";
/** A POAP still on its way after the claim answered: look again this often, this many times. */
const PENDING_CHECK_MS = 6000;
const PENDING_CHECKS = 10;
/** EventScreenShell's header under the status bar: padding + 44pt row + margins. */
const SHELL_HEADER = space.xs + 6 + 44 + 14;
const DEFAULT_MESSAGE = "You're verified! Welcome to the event.";
/** The pass never shrinks the picture below this, even on the smallest phones. */
const MIN_HERO = 120;

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
    const [errorTitle, setErrorTitle] = useState("Couldn't check you in");
    const [errorAction, setErrorAction] = useState<ProximityErrorAction | undefined>(undefined);
    const [postImage, setPostImage] = useState<string | null>(null);
    /** The event picture's own width / height, so it's shown whole */
    const [imageAspect, setImageAspect] = useState<number | null>(null);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    /** Height of the status + name block under the picture (measured) */
    const [infoHeight, setInfoHeight] = useState(92);
    const [postName, setPostName] = useState<string>("");
    const [resolvedPostId, setResolvedPostId] = useState<number | null>(null);
    const [mintStatus, setMintStatus] = useState<MintStatus>("idle");
    const [mintError, setMintError] = useState<string | null>(null);
    const [earnedPoints, setEarnedPoints] = useState(0);
    /** The POAP collectible while it's on its way to Solana (the socket or a check says when it lands) */
    const [pendingPoapId, setPendingPoapId] = useState<number | null>(null);
    const pendingUpdate = useCollectibles((s) => (pendingPoapId ? s.updates[String(pendingPoapId)] : undefined));

    const effectivePostId = postId ?? resolvedPostId;
    useEffect(() => { setImageAspect(null); }, [postImage]);
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

    // Landed while the screen is open (socket), or a quiet check now and then
    useEffect(() => {
        if (!pendingPoapId) return;
        if (pendingUpdate?.status === "minted") {
            setPendingPoapId(null);
            setMintStatus("success");
            haptics.notification('success');
            return;
        }
        if (pendingUpdate?.status === "failed") {
            setPendingPoapId(null);
            setMintStatus("failed");
            setMintError("You're checked in. Putting the POAP on Solana didn't work this time. Tap to retry.");
            return;
        }
        let checks = 0;
        const timer = setInterval(async () => {
            if (++checks > PENDING_CHECKS) return clearInterval(timer);
            try {
                const item = await getCollectible(pendingPoapId);
                if (!mountedRef.current) return;
                if (item.onchain || item.status === "failed") {
                    useCollectibles.getState().applyEvent({ type: "collectible", id: pendingPoapId,
                        status: item.onchain ? "minted" : "failed", asset_id: item.asset_id });
                }
            } catch { /* the next check, or the socket */ }
        }, PENDING_CHECK_MS);
        return () => clearInterval(timer);
    }, [pendingPoapId, pendingUpdate?.status]);

    const showError = (error: unknown) => {
        const info = describeProximityError(error, 'checkin');
        setErrorTitle(info.title);
        setMessage(info.message);
        setErrorAction(info.action === 'openSettings' || info.action === 'openLocationSettings' ? info.action : undefined);
        setState("error");
        haptics.notification('error');
    };

    /** Location for the venue check; throws a mapped client error when it can't be had. */
    const requireLocation = async () => {
        const loc = await getQuickLocation({ request: true, timeoutMs: 8000 });
        if (loc.status === 'denied') throw new ProximityClientError('locationDenied');
        if (loc.status === 'servicesOff') throw new ProximityClientError('locationServicesOff');
        if (loc.status === 'mocked') throw new ProximityClientError('mockLocation');
        if (loc.status !== 'ok') throw new ProximityClientError('locationUnavailable');
        return loc;
    };

    const handleVerify = async () => {
        if (!postId && !proximityToken) {
            setErrorTitle("Invalid event link");
            setMessage("This check-in link is incomplete. Ask the organizer to tap you again.");
            setErrorAction(undefined);
            setState("error");
            return;
        }

        setState("loading");
        try {
            const loc = await requireLocation();

            let result: any;
            if (proximityToken) {
                result = await verifyProximityToken(proximityToken, loc.latitude, loc.longitude);
            } else if (postId) {
                result = await checkinEvent(postId, { lat: loc.latitude, lng: loc.longitude });
            }

            // `interaction_type` is echoed on every token response, including
            // "not registered" — only `verified` means checked in.
            if (result?.verified === true) {
                if (result.post_image) {
                    setPostImage(result.post_image.startsWith("http") ? result.post_image : `https://nextvibe.s3.amazonaws.com/${result.post_image}`);
                }
                if (result.post_id) setResolvedPostId(result.post_id);
                setPostName(result.post_name || "Event");
                setState("verified");
                setMessage("You're verified! Welcome to the event.");
                haptics.notification('success');
            } else {
                setPostName(result?.post_name || "Event");
                setState("not_registered");
                setMessage(result?.message || result?.error || "You are not registered for this event.");
                haptics.notification('error');
            }
        } catch (error: any) {
            showError(error);
        }
    };

    const startMint = async (targetPostId: number) => {
        setMintStatus("minting");
        setMintError(null);
        AccessibilityInfo.announceForAccessibility?.("Minting your event NFT");
        try {
            const loc = await getQuickLocation({ request: true, timeoutMs: 8000 });
            if (!mountedRef.current) return;
            if (loc.status !== 'ok') {
                const info = describeProximityError(new ProximityClientError(
                    loc.status === 'denied' ? 'locationDenied'
                        : loc.status === 'servicesOff' ? 'locationServicesOff'
                            : loc.status === 'mocked' ? 'mockLocation' : 'locationUnavailable'
                ), 'checkin');
                setMintStatus("failed");
                setMintError(`You're checked in — ${info.message.charAt(0).toLowerCase()}${info.message.slice(1)}`);
                haptics.notification('error');
                return;
            }

            const result = await claimEventNft(targetPostId, {
                lat: loc.latitude,
                lng: loc.longitude
            });
            if (!mountedRef.current) return;
            setEarnedPoints(result.earned_points || 0);
            if (result.status === "offchain") {
                // No wallet: kept on the profile, a wallet can come any time
                setMintStatus("saved");
                useCollectibles.getState().refreshSummary();
                AccessibilityInfo.announceForAccessibility?.("POAP saved to your profile. Claim it anytime.");
            } else if (result.success) {
                setMintStatus("success");
                haptics.notification('success');
                AccessibilityInfo.announceForAccessibility?.(
                    `Event NFT minted. Plus ${result.earned_points || 0} REP.`
                );
            } else if ((result.status === "queued" || result.status === "minting") && result.collectible?.id
                && !result.collectible?.error) {
                // Still on its way (the queue had it): the pill keeps saying so until it lands
                setMintStatus("minting");
                setPendingPoapId(result.collectible.id);
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

            case "verified": {
                // The pass fills the top half of the screen: the picture as large
                // as fits (whole, never cropped), then the status and the name.
                const heroWidth = windowWidth - space.lg * 2;
                const naturalHeight = Math.round(heroWidth / (imageAspect ?? 16 / 9));
                const room = windowHeight / 2 - insets.top - SHELL_HEADER - infoHeight - space.md;
                const heroHeight = Math.max(MIN_HERO, Math.min(naturalHeight, Math.round(room)));
                const extraMessage = message && message !== DEFAULT_MESSAGE ? message : null;
                return (
                    <Animated.View
                        entering={reduceMotion ? undefined : FadeInUp.springify().damping(16)}
                        style={styles.verifiedWrap}
                    >
                        <ScrollView
                            style={styles.verifiedScroll}
                            contentContainerStyle={styles.verifiedScrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <Animated.View entering={enter(0)} style={styles.heroShadow}>
                                <View style={[styles.hero, { height: heroHeight }]}>
                                    {postImage ? (
                                        <>
                                            {/* The same picture, blurred, fills whatever the whole one leaves */}
                                            <Image
                                                source={{ uri: postImage }}
                                                style={StyleSheet.absoluteFill}
                                                contentFit="cover"
                                                blurRadius={45}
                                            />
                                            <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
                                            <Image
                                                source={{ uri: postImage }}
                                                style={StyleSheet.absoluteFill}
                                                contentFit="contain"
                                                transition={180}
                                                accessibilityLabel={`${postName} cover`}
                                                onLoad={(e) => {
                                                    const { width, height } = e.source;
                                                    if (width > 0 && height > 0) setImageAspect(width / height);
                                                }}
                                            />
                                        </>
                                    ) : (
                                        <LinearGradient
                                            colors={["#2E1065", "#1A0B33", "#0F0620"]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={[StyleSheet.absoluteFill, styles.heroFallback]}
                                        >
                                            <BadgeCheck size={52} color="#D8B4FE" strokeWidth={1.4} />
                                        </LinearGradient>
                                    )}
                                    {!reduceMotion && (
                                        <SuccessBurst trigger={mintStatus === "success"} color="#C084FC" />
                                    )}
                                </View>
                            </Animated.View>

                            <View
                                style={styles.info}
                                onLayout={(e) => {
                                    const h = Math.round(e.nativeEvent.layout.height);
                                    if (Math.abs(h - infoHeight) > 1) setInfoHeight(h);
                                }}
                            >
                                <Animated.View entering={enter(100)} style={styles.chipsRow}>
                                    <View style={[styles.checkedChip, isDark ? styles.checkedChipDark : styles.checkedChipLight]}>
                                        <BadgeCheck size={14} color={isDark ? "#E9D5FF" : "#6D28D9"} strokeWidth={2.2} />
                                        <Text style={[styles.checkedChipText, { color: isDark ? "#F3E8FF" : "#4C1D95" }]}>
                                            Checked in
                                        </Text>
                                    </View>
                                    {effectivePostId != null && mintStatus !== "idle" && (
                                        <MintStatusPill
                                            status={mintStatus}
                                            points={earnedPoints}
                                            onRetry={() => startMint(effectivePostId)}
                                        />
                                    )}
                                </Animated.View>
                                <Animated.Text
                                    entering={enter(180)}
                                    style={[styles.eventName, { color: main }]}
                                    numberOfLines={2}
                                    accessibilityRole="header"
                                >
                                    {postName}
                                </Animated.Text>
                                {mintStatus === "failed" && !!mintError ? (
                                    <Text style={[styles.passMessage, { color: mutedColor }]} numberOfLines={3}>
                                        {mintError}
                                    </Text>
                                ) : extraMessage ? (
                                    <Text style={[styles.passMessage, { color: mutedColor }]} numberOfLines={2}>
                                        {extraMessage}
                                    </Text>
                                ) : null}
                            </View>

                            {mintStatus === "saved" && (
                                <Animated.View entering={enter(300)} style={styles.savedNote}>
                                    <SavedOffchainNote reason="checkin" />
                                </Animated.View>
                            )}
                        </ScrollView>

                        <Animated.View
                            entering={reduceMotion ? undefined : FadeInUp.delay(350).duration(MOTION.duration.normal)}
                            style={styles.ctaBlock}
                        >
                            {!canTapToMeet && (
                                <Text style={[styles.simNote, { color: mutedColor }]} numberOfLines={1}>
                                    Tap to Meet needs a physical device with NFC or Bluetooth.
                                </Text>
                            )}
                            <View style={styles.ctaRow}>
                                <View style={styles.ctaDone}>
                                    <EventCta
                                        label="Done"
                                        variant="secondary"
                                        onPress={() => safeBack(router)}
                                    />
                                </View>
                                <View style={styles.ctaMeet}>
                                    <EventCta
                                        label="Tap to Meet"
                                        icon={<Smartphone size={18} color={colors.text} />}
                                        onPress={handleTapToMeet}
                                        disabled={!canTapToMeet}
                                        accessibilityLabel="Tap to meet people at this event"
                                    />
                                </View>
                            </View>
                        </Animated.View>
                    </Animated.View>
                );
            }

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
                        <View style={[styles.iconCircle, styles.warningCircle]}>
                            <ShieldX size={48} color={colors.warning} strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: colors.warning }]}>
                            {errorTitle}
                        </Text>
                        <Text style={[styles.description, { color: mutedColor }]}>
                            {message}
                        </Text>

                        {errorAction && (
                            <View style={styles.ctaWidth}>
                                <EventCta
                                    label="Open Settings"
                                    onPress={() => {
                                        if (errorAction === 'openLocationSettings' && Platform.OS === 'android') {
                                            Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
                                        } else {
                                            Linking.openSettings().catch(() => {});
                                        }
                                    }}
                                />
                            </View>
                        )}
                        <View style={styles.errorActions}>
                            <View style={{ flex: 1 }}>
                                <EventCta
                                    label="Try again"
                                    variant={errorAction ? "secondary" : "primary"}
                                    onPress={handleVerify}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <EventCta
                                    label="Go Back"
                                    variant="secondary"
                                    onPress={() => safeBack(router)}
                                />
                            </View>
                        </View>
                    </Animated.View>
                );
        }
    };

    return (
        <EventScreenShell title="Event Check-in" bodyStyle={state === "verified" ? styles.verifiedShellBody : undefined}>
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
    verifiedShellBody: {
        justifyContent: "flex-start",
        alignItems: "stretch",
        // Full width, so the scroll view doesn't clip the picture's glow
        paddingHorizontal: 0,
        paddingBottom: space.md,
    },
    verifiedWrap: {
        flex: 1,
        width: "100%",
    },
    verifiedScroll: {
        flex: 1,
    },
    verifiedScrollContent: {
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
    },
    heroShadow: {
        borderRadius: 24,
        ...Platform.select({
            ios: {
                shadowColor: "#7C3AED",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.3,
                shadowRadius: 22,
            },
            android: { elevation: 10 },
        }),
    },
    hero: {
        width: "100%",
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "#140A26",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.14)",
    },
    heroShade: {
        // Dark enough that the blurred fill reads as a mat, not a seam
        backgroundColor: "rgba(10,4,16,0.62)",
    },
    heroFallback: {
        alignItems: "center",
        justifyContent: "center",
    },
    info: {
        marginTop: space.md,
        gap: space.sm,
    },
    chipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: space.sm,
    },
    checkedChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs + 2,
        height: 30,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    checkedChipDark: {
        backgroundColor: "rgba(168,85,247,0.24)",
        borderColor: "rgba(216,180,254,0.40)",
    },
    checkedChipLight: {
        backgroundColor: "rgba(124,58,237,0.12)",
        borderColor: "rgba(124,58,237,0.28)",
    },
    checkedChipText: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
    passMessage: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        lineHeight: 20,
        includeFontPadding: false,
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
    warningCircle: {
        backgroundColor: "rgba(251,191,36,0.1)",
        borderColor: "rgba(251,191,36,0.25)",
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
        lineHeight: 30,
        includeFontPadding: false,
        letterSpacing: -0.4,
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
    savedNote: {
        marginTop: space.xs,
        alignSelf: 'stretch',
    },
    ctaBlock: {
        width: "100%",
        gap: space.sm,
        paddingTop: space.md,
        paddingBottom: space.sm,
        paddingHorizontal: space.lg,
    },
    ctaRow: {
        flexDirection: "row",
        gap: space.sm + 2,
    },
    ctaDone: {
        flex: 1,
    },
    ctaMeet: {
        flex: 1.5,
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
