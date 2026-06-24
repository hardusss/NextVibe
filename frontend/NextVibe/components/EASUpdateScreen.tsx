import React, { useEffect, useState } from "react";
import {
    View,
    StyleSheet,
    StatusBar,
    Text,
} from "react-native";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence,
    Easing,
} from "react-native-reanimated";

const COLORS = {
    bg: "#0A0410",
    text: "#FFFFFF",
    textMuted: "rgba(255, 255, 255, 0.45)",
    border: "rgba(255, 255, 255, 0.12)",
    accent: "#A855F7", // Purple/violet
    success: "#10B981", // Green
    error: "#EF4444", // Red
};

type UpdatePhase =
    | "checking"
    | "downloading"
    | "ready"
    | "up-to-date"
    | "error";

const phaseLabels: Record<UpdatePhase, string> = {
    checking: "Checking for updates...",
    downloading: "Downloading update...",
    ready: "Finalizing update...",
    "up-to-date": "NextVibe is up to date!",
    error: "Launching app...",
};

const phaseSubLabels: Record<UpdatePhase, string> = {
    checking: "Preparing to fetch the latest version...",
    downloading: "The app might restart once the update is ready.",
    ready: "Restarting app in a moment...",
    "up-to-date": "Launching NextVibe...",
    error: "Continuing to launch NextVibe...",
};

export default function EASUpdateScreen() {
    const router = useRouter();
    const [phase, setPhase] = useState<UpdatePhase>("checking");

    // ── Reanimated values ────────────────────────────────────────
    const scannerTranslateX = useSharedValue(-60);
    const downloadProgress = useSharedValue(0);
    const logoScale = useSharedValue(1);

    // Continuous Laser / LED / Logo animations
    useEffect(() => {
        // Scanner animation (checking phase)
        scannerTranslateX.value = withRepeat(
            withSequence(
                withTiming(240, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
                withTiming(-60, { duration: 1500, easing: Easing.inOut(Easing.quad) })
            ),
            -1,
            false
        );

        // Logo pulse
        logoScale.value = withRepeat(
            withSequence(
                withTiming(1.06, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    // ── Update logic ─────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                await new Promise((resolve) => setTimeout(resolve, 1500));

                const result = await Updates.checkForUpdateAsync();
                if (cancelled) return;

                if (result.isAvailable) {
                    setPhase("downloading");

                    downloadProgress.value = withTiming(1, {
                        duration: 3500,
                        easing: Easing.out(Easing.quad),
                    });

                    await Updates.fetchUpdateAsync();
                    if (cancelled) return;

                    setPhase("ready");
                    // Automatically reload the app
                    setTimeout(async () => {
                        try {
                            await Updates.reloadAsync();
                        } catch {
                            router.replace("/splash");
                        }
                    }, 1500);
                } else {
                    setPhase("up-to-date");
                    setTimeout(() => {
                        if (!cancelled) router.replace("/splash");
                    }, 1500);
                }
            } catch (e) {
                if (cancelled) return;
                console.error("EAS Update failed:", e);
                setPhase("error");
                setTimeout(() => {
                    if (!cancelled) router.replace("/splash");
                }, 1500);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Animated Styles ──────────────────────────────────────────
    const rScannerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: scannerTranslateX.value }],
    }));

    const rDownloadProgressStyle = useAnimatedStyle(() => ({
        width: `${downloadProgress.value * 100}%`,
    }));

    const logoAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: logoScale.value }],
    }));

    return (
        <View style={styles.root}>
            <StatusBar backgroundColor={COLORS.bg} barStyle="light-content" />

            <View style={styles.container}>
                {/* Pulsing Logo Frame */}
                <View style={styles.logoFrame}>
                    <Animated.Image
                        source={require("@/assets/logo.png")}
                        style={[styles.logo, logoAnimatedStyle]}
                        resizeMode="contain"
                    />
                </View>

                {/* Status/Phase Title */}
                <Text style={styles.title}>
                    {phaseLabels[phase]}
                </Text>

                {/* Subtitle / User info */}
                <Text style={styles.subtitle}>
                    {phaseSubLabels[phase]}
                </Text>

                {/* Progress bar container */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBarBg}>
                        {phase === "downloading" ? (
                            <Animated.View style={[styles.progressBarFill, rDownloadProgressStyle]} />
                        ) : phase === "checking" ? (
                            <Animated.View style={[styles.progressBarScanner, rScannerStyle]} />
                        ) : (
                            <View style={[styles.progressBarFill, { width: "100%", backgroundColor: phase === "error" ? COLORS.error : COLORS.success }]} />
                        )}
                    </View>
                </View>
            </View>

            {/* Bottom info to avoid clutter */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Please do not close the app
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 40,
    },
    container: {
        alignItems: "center",
        width: "100%",
    },
    logoFrame: {
        width: 100,
        height: 100,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
    },
    logo: {
        width: 80,
        height: 80,
    },
    title: {
        fontSize: 20,
        fontWeight: "600",
        color: COLORS.text,
        textAlign: "center",
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.textMuted,
        textAlign: "center",
        marginBottom: 32,
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    progressContainer: {
        width: 240,
        height: 4,
    },
    progressBarBg: {
        width: 240,
        height: 4,
        backgroundColor: COLORS.border,
        borderRadius: 2,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: COLORS.accent,
    },
    progressBarScanner: {
        width: 60,
        height: "100%",
        backgroundColor: COLORS.accent,
    },
    footer: {
        position: "absolute",
        bottom: 50,
    },
    footerText: {
        fontSize: 12,
        color: COLORS.textMuted,
        letterSpacing: 0.5,
    },
});
