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
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ShieldCheck, ShieldX, Nfc, Loader2 } from "lucide-react-native";
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
import { checkinEvent, claimEventNft } from "@/src/api/event.checkin";

type CheckinState = "idle" | "loading" | "verified" | "not_registered" | "error" | "claiming" | "claim_success" | "claim_failed";

export default function EventCheckinScreen() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const params = useLocalSearchParams<{ postId: string }>();
    const postId = params.postId ? parseInt(params.postId, 10) : null;

    const [state, setState] = useState<CheckinState>("idle");
    const [message, setMessage] = useState("");
    const [username, setUsername] = useState("");
    const [postImage, setPostImage] = useState<string | null>(null);
    const [postName, setPostName] = useState<string>("");
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [displayPoints, setDisplayPoints] = useState(0);

    const bg = isDark ? "#0A0410" : "#FFFFFF";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const accent = "#A855F7";

    // Pulse animation
    const pulseScale = useSharedValue(1);
    useEffect(() => {
        if (state === "idle") {
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
        if (postId && state === "idle") {
            handleVerify();
        }
    }, [postId]);

    const handleVerify = async () => {
        if (!postId) {
            setState("error");
            setMessage("Invalid event link.");
            return;
        }

        setState("loading");
        try {
            const result = await checkinEvent(postId);
            if (result.verified) {
                if (result.post_image) {
                    setPostImage(result.post_image.startsWith("http") ? result.post_image : `https://nextvibe.s3.amazonaws.com/${result.post_image}`);
                }
                setPostName(result.post_name || "Event");
                setState("verified");
                setMessage("You're verified! Welcome to the event.");
                setUsername(result.username || "");
                Vibration.vibrate([0, 100, 80, 100]);
            } else {
                setState("not_registered");
                setMessage(result.message || "You are not registered for this event.");
                Vibration.vibrate([0, 200]);
            }
        } catch (error: any) {
            setState("error");
            if (error.response?.status === 401) {
                setMessage("Please log in to verify your attendance.");
            } else if (error.response?.status === 404) {
                setMessage("Event not found.");
            } else {
                setMessage("Something went wrong. Please try again.");
            }
            Vibration.vibrate([0, 200]);
        }
    };

    const handleClaim = async () => {
        if (!postId) return;
        setState("claiming");
        try {
            const result = await claimEventNft(postId);
            if (result.success) {
                setEarnedPoints(result.earned_points || 0);
                setState("claim_success");
                Vibration.vibrate([0, 50, 50, 50, 50, 100]);
            } else {
                setState("claim_failed");
                setMessage(result.error || "Failed to mint NFT.");
            }
        } catch (error: any) {
            console.log("STATUS:", error.response?.status);
            console.log("DATA:", JSON.stringify(error.response?.data));
            console.log("MSG:", error.message);

            setState("claim_failed"); 
            setMessage(error.response?.data?.error || "Something went wrong during claim. Please try again.");
            Vibration.vibrate([0, 200]);
        }
    };

    useEffect(() => {
        if (state === "claim_success" && earnedPoints > 0) {
            let current = 0;
            const interval = setInterval(() => {
                current += 1;
                setDisplayPoints(current);
                Vibration.vibrate(40);
                if (current >= earnedPoints) clearInterval(interval);
            }, 120);
            return () => clearInterval(interval);
        }
    }, [state, earnedPoints]);

    const renderContent = () => {
        switch (state) {
            case "idle":
                return (
                    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.centerContent}>
                        <Animated.View style={[styles.iconCircle, {
                            backgroundColor: "rgba(168,85,247,0.1)",
                            borderColor: "rgba(168,85,247,0.2)",
                        }, pulseStyle]}>
                            <Nfc size={48} color={accent} strokeWidth={1.5} />
                        </Animated.View>

                        <Text style={[styles.heading, { color: main }]}>
                            Event Check-in
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            Tap the button below to verify your attendance at this event.
                        </Text>

                        <TouchableOpacity
                            onPress={handleVerify}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "rgba(168,85,247,0.15)",
                                borderColor: "rgba(168,85,247,0.35)",
                            }]}
                        >
                            <ShieldCheck size={20} color={accent} strokeWidth={1.8} />
                            <Text style={[styles.verifyBtnText, { color: accent }]}>
                                Verify Attendance
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                );

            case "loading":
                return (
                    <View style={styles.centerContent}>
                        <ActivityIndicator size="large" color={accent} />
                        <Text style={[styles.loadingText, { color: muted }]}>
                            Verifying...
                        </Text>
                    </View>
                );

            case "verified":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        {postImage ? (
                            <Image
                                source={{ uri: postImage }}
                                style={styles.eventPhoto}
                                contentFit="cover"
                            />
                        ) : (
                            <View style={[styles.iconCircle, {
                                backgroundColor: "rgba(34,197,94,0.1)",
                                borderColor: "rgba(34,197,94,0.25)",
                            }]}>
                                <ShieldCheck size={48} color="#4ade80" strokeWidth={1.5} />
                            </View>
                        )}

                        <Text style={[styles.heading, { color: main }]}>
                            {postName}
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {message}
                        </Text>

                        <TouchableOpacity
                            onPress={handleClaim}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "rgba(168,85,247,0.15)",
                                borderColor: "rgba(168,85,247,0.35)",
                                marginTop: 16,
                            }]}
                        >
                            <Text style={[styles.verifyBtnText, { color: accent }]}>
                                Claim Event cNFT
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                );

            case "claiming":
                return (
                    <View style={styles.centerContent}>
                        <ActivityIndicator size="large" color={accent} />
                        <Text style={[styles.loadingText, { color: muted }]}>
                            Minting your cNFT...
                        </Text>
                    </View>
                );

            case "claim_failed":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        <View style={[styles.iconCircle, {
                            backgroundColor: "rgba(239,68,68,0.1)",
                            borderColor: "rgba(239,68,68,0.25)",
                        }]}>
                            <ShieldX size={48} color="#f87171" strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: "#f87171" }]}>
                            Claim Failed
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {message}
                        </Text>

                        <TouchableOpacity
                            onPress={handleClaim}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "rgba(168,85,247,0.12)",
                                borderColor: "rgba(168,85,247,0.3)",
                            }]}
                        >
                            <Text style={[styles.verifyBtnText, { color: accent }]}>
                                Retry Claim
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => router.back()}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "transparent",
                                borderColor: "transparent",
                                marginTop: 0,
                            }]}
                        >
                            <Text style={[styles.verifyBtnText, { color: muted }]}>
                                Maybe Later
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                );

            case "claim_success":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.fullScreenSuccess}>
                        <Animated.View entering={FadeInDown.delay(300).springify()}>
                            <View style={[styles.iconCircle, {
                                backgroundColor: "rgba(34,197,94,0.1)",
                                borderColor: "rgba(34,197,94,0.25)",
                                alignSelf: "center",
                                width: 140,
                                height: 140,
                                borderRadius: 70,
                                marginBottom: 20,
                            }]}>
                                <Text style={styles.repPointsText}>+{displayPoints}</Text>
                            </View>
                        </Animated.View>

                        <Animated.Text entering={FadeInDown.delay(500)} style={[styles.heading, { color: "#4ade80", fontSize: 28 }]}>
                            cNFT Claimed!
                        </Animated.Text>
                        <Animated.Text entering={FadeInDown.delay(700)} style={[styles.description, { color: muted, fontSize: 16, marginTop: 10 }]}>
                            Event NFT minted to your collection and reputation points added!
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

            case "not_registered":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        <View style={[styles.iconCircle, {
                            backgroundColor: "rgba(239,68,68,0.1)",
                            borderColor: "rgba(239,68,68,0.25)",
                        }]}>
                            <ShieldX size={48} color="#f87171" strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: "#f87171" }]}>
                            Not Registered
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {message}
                        </Text>

                        <TouchableOpacity
                            onPress={() => router.back()}
                            activeOpacity={0.8}
                            style={[styles.verifyBtn, {
                                backgroundColor: "rgba(239,68,68,0.1)",
                                borderColor: "rgba(239,68,68,0.25)",
                            }]}
                        >
                            <Text style={[styles.verifyBtnText, { color: "#f87171" }]}>
                                Go Back
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                );

            case "error":
                return (
                    <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.centerContent}>
                        <View style={[styles.iconCircle, {
                            backgroundColor: "rgba(251,191,36,0.1)",
                            borderColor: "rgba(251,191,36,0.25)",
                        }]}>
                            <ShieldX size={48} color="#fbbf24" strokeWidth={1.5} />
                        </View>

                        <Text style={[styles.heading, { color: "#fbbf24" }]}>
                            Error
                        </Text>
                        <Text style={[styles.description, { color: muted }]}>
                            {message}
                        </Text>

                        <View style={styles.errorActions}>
                            <TouchableOpacity
                                onPress={() => { setState("idle"); setMessage(""); }}
                                activeOpacity={0.8}
                                style={[styles.verifyBtn, {
                                    backgroundColor: "rgba(168,85,247,0.12)",
                                    borderColor: "rgba(168,85,247,0.3)",
                                    flex: 1,
                                }]}
                            >
                                <Text style={[styles.verifyBtnText, { color: accent }]}>
                                    Retry
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                activeOpacity={0.8}
                                style={[styles.verifyBtn, {
                                    backgroundColor: "rgba(255,255,255,0.05)",
                                    borderColor: border,
                                    flex: 1,
                                }]}
                            >
                                <Text style={[styles.verifyBtnText, { color: muted }]}>
                                    Go Back
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.back()}
                    style={styles.backBtn}
                >
                    <ChevronLeft size={22} color={main} strokeWidth={2} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: main }]}>Event Check-in</Text>
                <View style={{ width: 44 }} />
            </View>

            {/* Main */}
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
    loadingText: {
        fontFamily: "Dank Mono",
        fontSize: 14,
        marginTop: 12,
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
        marginTop: 8,
    },
    verifyBtnText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },
    errorActions: {
        flexDirection: "row",
        gap: 10,
        width: "100%",
    },
    eventPhoto: {
        width: 140,
        height: 140,
        borderRadius: 24,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: "rgba(168,85,247,0.3)",
    },
    fullScreenSuccess: {
        flex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 40,
    },
    repPointsText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 42,
        color: "#4ade80",
        includeFontPadding: false,
    },
});
