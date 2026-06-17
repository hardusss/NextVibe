import React, { useEffect, useState } from "react";
import {
    View,
    StyleSheet,
    StatusBar,
    Dimensions,
    TouchableOpacity,
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
    FadeIn,
} from "react-native-reanimated";

const { width: SCREEN_W } = Dimensions.get("window");

const COLORS = {
    bg: "#000000",
    text: "#FFFFFF",
    textMuted: "rgba(255, 255, 255, 0.45)",
    border: "rgba(255, 255, 255, 0.15)",
    accent: "#8B5CF6", // Violet
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
    checking: "CHECKING FOR UPDATES",
    downloading: "DOWNLOADING PATCH",
    ready: "PATCH READY TO APPLY",
    "up-to-date": "SYSTEM IS UP TO DATE",
    error: "UPDATE CHECK FAILED",
};

const phaseSubLabels: Record<UpdatePhase, string> = {
    checking: "establishing handshakes with remote nodes…",
    downloading: "fetching files from edge CDN assets…",
    ready: "patch files verified. ready to execute hot-swap.",
    "up-to-date": "no pending patches found on remote channels.",
    error: "connection failure. bypassing system check.",
};

export default function EASUpdateScreen() {
    const router = useRouter();
    const [phase, setPhase] = useState<UpdatePhase>("checking");

    // ── Reanimated values ────────────────────────────────────────
    const scannerTranslateX = useSharedValue(-60);
    const downloadProgress = useSharedValue(0);
    const laserGlowOpacity = useSharedValue(0.4);
    const ledOpacity = useSharedValue(0.3);

    // Continuous Laser / LED animations
    useEffect(() => {
        // Scanner animation (checking phase)
        scannerTranslateX.value = withRepeat(
            withSequence(
                withTiming(160, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
                withTiming(-60, { duration: 1500, easing: Easing.inOut(Easing.quad) })
            ),
            -1,
            false
        );

        // LED pulse
        ledOpacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );

        // Laser glow pulse
        laserGlowOpacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.4, { duration: 1000, easing: Easing.inOut(Easing.ease) })
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
                await new Promise((resolve) => setTimeout(resolve, 1200));

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
                } else {
                    setPhase("up-to-date");
                    setTimeout(() => {
                        if (!cancelled) router.replace("/splash");
                    }, 2200);
                }
            } catch (e) {
                if (cancelled) return;
                console.error("EAS Update failed:", e);
                setPhase("error");
                setTimeout(() => {
                    if (!cancelled) router.replace("/splash");
                }, 2200);
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

    const rLedStyle = useAnimatedStyle(() => {
        const pulsePhase = phase === "checking" || phase === "downloading";
        return {
            opacity: pulsePhase ? ledOpacity.value : 1,
        };
    });

    const rLaserStyle = useAnimatedStyle(() => ({
        opacity: laserGlowOpacity.value,
    }));

    // ── Handlers ─────────────────────────────────────────────────
    const handleApply = async () => {
        try {
            await Updates.reloadAsync();
        } catch {
            router.replace("/splash");
        }
    };

    const handleSkip = () => {
        router.replace("/splash");
    };

    // Color helpers for active terminal states
    const getLaserColor = () => {
        if (phase === "up-to-date") return COLORS.success;
        if (phase === "error") return COLORS.error;
        return COLORS.accent;
    };

    return (
        <View style={styles.root}>
            <StatusBar backgroundColor="#000000" barStyle="light-content" />

            {/* Top HUD bar */}
            <View style={styles.hudHeader}>
                <Text style={styles.hudHeaderText}>NEXTVIBE // OTA_CORE_v1.0.4</Text>
                <View style={styles.hudHeaderLine} />
            </View>

            {/* Main Typographic Section */}
            <View style={styles.mainContainer}>
                {/* Minimal LED Status Indicator */}
                <View style={styles.ledRow}>
                    <Animated.View
                        style={[
                            styles.led,
                            { backgroundColor: getLaserColor() },
                            rLedStyle,
                        ]}
                    />
                    <Text style={[styles.ledText, { color: getLaserColor() }]}>
                        {phase.toUpperCase()}
                    </Text>
                </View>

                {/* Term title & sub */}
                <Animated.Text entering={FadeIn.duration(300)} style={styles.termTitle}>
                    {phaseLabels[phase]}
                </Animated.Text>
                
                <Text style={styles.termSub}>
                    {phaseSubLabels[phase]}
                </Text>

                {/* laser line track / progress */}
                <View style={styles.laserContainer}>
                    {phase === "checking" && (
                        <View style={styles.laserTrack}>
                            <Animated.View style={[styles.laserScannerBar, rScannerStyle]} />
                        </View>
                    )}

                    {phase === "downloading" && (
                        <View style={styles.laserTrack}>
                            <Animated.View style={[styles.laserFill, rDownloadProgressStyle]} />
                        </View>
                    )}

                    {(phase === "ready" || phase === "up-to-date" || phase === "error") && (
                        <Animated.View
                            style={[
                                styles.laserStatic,
                                { backgroundColor: getLaserColor() },
                                rLaserStyle,
                            ]}
                        />
                    )}
                </View>

                {/* Actions */}
                {phase === "ready" && (
                    <Animated.View entering={FadeIn.duration(350)} style={styles.btnWrapper}>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={handleApply}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.actionBtnText}>[ DEPLOY PATCH ]</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.skipBtn}
                            onPress={handleSkip}
                            activeOpacity={0.6}
                        >
                            <Text style={styles.skipBtnText}>SKIP DEPLOYMENT</Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}
            </View>

            {/* Bottom HUD info */}
            <View style={styles.hudFooter}>
                <View style={styles.hudFooterLine} />
                <View style={styles.hudFooterRow}>
                    <Text style={styles.hudFooterText}>ENV: PRODUCTION</Text>
                    <Text style={styles.hudFooterText}>SECURE CON: TRUE</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
        paddingHorizontal: 32,
    },
    hudHeader: {
        position: "absolute",
        top: 60,
        left: 32,
        right: 32,
    },
    hudHeaderText: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        color: COLORS.textMuted,
        letterSpacing: 2,
    },
    hudHeaderLine: {
        height: 1,
        backgroundColor: COLORS.border,
        marginTop: 10,
    },
    mainContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "flex-start",
    },
    ledRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 20,
    },
    led: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    ledText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 10,
        letterSpacing: 2,
    },
    termTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 22,
        color: COLORS.text,
        letterSpacing: 1,
        marginBottom: 8,
    },
    termSub: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        color: COLORS.textMuted,
        lineHeight: 18,
    },
    laserContainer: {
        width: "100%",
        height: 2,
        marginTop: 32,
    },
    laserTrack: {
        width: 200,
        height: 2,
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        overflow: "hidden",
    },
    laserScannerBar: {
        width: 60,
        height: "100%",
        backgroundColor: COLORS.accent,
    },
    laserFill: {
        height: "100%",
        backgroundColor: COLORS.accent,
    },
    laserStatic: {
        width: 200,
        height: 2,
    },
    btnWrapper: {
        marginTop: 48,
        gap: 16,
    },
    actionBtn: {
        height: 44,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.text,
        paddingHorizontal: 24,
    },
    actionBtnText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        color: COLORS.text,
        letterSpacing: 1.5,
    },
    skipBtn: {
        paddingVertical: 6,
    },
    skipBtnText: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        color: COLORS.textMuted,
        letterSpacing: 1.5,
    },
    hudFooter: {
        position: "absolute",
        bottom: 50,
        left: 32,
        right: 32,
    },
    hudFooterLine: {
        height: 1,
        backgroundColor: COLORS.border,
        marginBottom: 10,
    },
    hudFooterRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    hudFooterText: {
        fontFamily: "Dank Mono",
        fontSize: 10,
        color: COLORS.textMuted,
        letterSpacing: 1.5,
    },
});
