import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    View,
    StyleSheet,
    StatusBar,
    Animated,
    Easing,
    Dimensions,
    TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Design tokens ──────────────────────────────────────────────
const C = {
    bg: "#0A0410",
    card: "rgba(22, 10, 42, 0.65)",
    violet: "#6D28D9",
    violetLight: "#8B5CF6",
    violetMuted: "#4C1D95",
    purple: "#A855F7",
    fuchsia: "#D946EF",
    line: "#2D1F52",
    text: "#E8E0F5",
    textSecondary: "#9C8FBB",
    muted: "#4B3D72",
    success: "#34D399",
    successBg: "rgba(52, 211, 153, 0.12)",
    glow: "rgba(168, 85, 247, 0.25)",
};

const ORBIT_SIZE = 200;
const DOT_SIZE = 8;

// ── Helpers ────────────────────────────────────────────────────
type UpdatePhase =
    | "checking"
    | "downloading"
    | "ready"
    | "up-to-date"
    | "error";

const phaseLabels: Record<UpdatePhase, string> = {
    checking: "Checking for updates…",
    downloading: "Downloading update…",
    ready: "Update ready!",
    "up-to-date": "You're up to date",
    error: "Update check failed",
};

const phaseSubLabels: Record<UpdatePhase, string> = {
    checking: "Connecting to NextVibe servers",
    downloading: "Pulling the latest micro-patch",
    ready: "Tap the button below to apply",
    "up-to-date": "No new updates available",
    error: "Please try again later",
};

// ── Component ──────────────────────────────────────────────────
export default function EASUpdateScreen() {
    const router = useRouter();

    // ── State ──────────────────────────────────────────────────
    const [phase, setPhase] = useState<UpdatePhase>("checking");

    // ── Animated values ────────────────────────────────────────
    const fadeIn = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0.85)).current;
    const logoPulse = useRef(new Animated.Value(1)).current;
    const orbit1 = useRef(new Animated.Value(0)).current;
    const orbit2 = useRef(new Animated.Value(0)).current;
    const progressWidth = useRef(new Animated.Value(0)).current;
    const glowOpacity = useRef(new Animated.Value(0.3)).current;
    const statusFade = useRef(new Animated.Value(0)).current;
    const buttonSlide = useRef(new Animated.Value(40)).current;
    const buttonOpacity = useRef(new Animated.Value(0)).current;
    const particleAnims = useRef(
        Array.from({ length: 6 }, () => ({
            x: new Animated.Value(0),
            y: new Animated.Value(0),
            opacity: new Animated.Value(0),
        }))
    ).current;

    // Refs for cleanup
    const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
    const orbitAnimRef = useRef<Animated.CompositeAnimation | null>(null);
    const glowAnimRef = useRef<Animated.CompositeAnimation | null>(null);
    const particleAnimRef = useRef<Animated.CompositeAnimation | null>(null);

    // ── Particle animation ─────────────────────────────────────
    const startParticles = useCallback(() => {
        const anims = particleAnims.map((p, i) => {
            const angle = (Math.PI * 2 * i) / particleAnims.length;
            const radius = 80 + Math.random() * 40;
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(i * 300),
                    Animated.parallel([
                        Animated.timing(p.opacity, {
                            toValue: 0.6,
                            duration: 800,
                            useNativeDriver: true,
                        }),
                        Animated.timing(p.x, {
                            toValue: Math.cos(angle) * radius,
                            duration: 2000,
                            easing: Easing.out(Easing.cubic),
                            useNativeDriver: true,
                        }),
                        Animated.timing(p.y, {
                            toValue: Math.sin(angle) * radius,
                            duration: 2000,
                            easing: Easing.out(Easing.cubic),
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.timing(p.opacity, {
                        toValue: 0,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.parallel([
                        Animated.timing(p.x, {
                            toValue: 0,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                        Animated.timing(p.y, {
                            toValue: 0,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ]),
                ])
            );
        });

        const composite = Animated.parallel(anims);
        particleAnimRef.current = composite;
        composite.start();
    }, [particleAnims]);

    // ── Continuous animations ──────────────────────────────────
    useEffect(() => {
        // Entrance
        Animated.parallel([
            Animated.timing(fadeIn, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
                toValue: 1,
                friction: 6,
                tension: 80,
                useNativeDriver: true,
            }),
            Animated.timing(statusFade, {
                toValue: 1,
                duration: 500,
                delay: 300,
                useNativeDriver: true,
            }),
        ]).start();

        // Logo pulse
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(logoPulse, {
                    toValue: 1.06,
                    duration: 1400,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(logoPulse, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        pulseAnimRef.current = pulse;
        pulse.start();

        // Orbits
        const orbitAnim = Animated.parallel([
            Animated.loop(
                Animated.timing(orbit1, {
                    toValue: 1,
                    duration: 4000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ),
            Animated.loop(
                Animated.timing(orbit2, {
                    toValue: 1,
                    duration: 5500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ),
        ]);
        orbitAnimRef.current = orbitAnim;
        orbitAnim.start();

        // Glow pulse
        const glow = Animated.loop(
            Animated.sequence([
                Animated.timing(glowOpacity, {
                    toValue: 0.7,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(glowOpacity, {
                    toValue: 0.3,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        );
        glowAnimRef.current = glow;
        glow.start();

        startParticles();

        return () => {
            pulseAnimRef.current?.stop();
            orbitAnimRef.current?.stop();
            glowAnimRef.current?.stop();
            particleAnimRef.current?.stop();
        };
    }, []);

    // ── Update logic ───────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const result = await Updates.checkForUpdateAsync();

                if (cancelled) return;

                if (result.isAvailable) {
                    setPhase("downloading");
                    // Animate progress bar
                    Animated.timing(progressWidth, {
                        toValue: 1,
                        duration: 3000,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: false,
                    }).start();

                    await Updates.fetchUpdateAsync();

                    if (cancelled) return;
                    setPhase("ready");

                    // Show button
                    Animated.parallel([
                        Animated.timing(buttonOpacity, {
                            toValue: 1,
                            duration: 400,
                            useNativeDriver: true,
                        }),
                        Animated.spring(buttonSlide, {
                            toValue: 0,
                            friction: 7,
                            tension: 60,
                            useNativeDriver: true,
                        }),
                    ]).start();
                } else {
                    if (cancelled) return;
                    setPhase("up-to-date");

                    // Auto-continue after 2s
                    setTimeout(() => {
                        if (!cancelled) router.replace("/splash");
                    }, 2000);
                }
            } catch (e) {
                if (cancelled) return;
                console.error("EAS Update error:", e);
                setPhase("error");

                // Auto-continue after 3s
                setTimeout(() => {
                    if (!cancelled) router.replace("/splash");
                }, 3000);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Derived animations ─────────────────────────────────────
    const orbitRotation1 = orbit1.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });
    const orbitRotation2 = orbit2.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "-360deg"],
    });

    const barWidthInterp = progressWidth.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
    });

    // ── Handlers ───────────────────────────────────────────────
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

    // ── Render helpers ─────────────────────────────────────────
    const isLoading = phase === "checking" || phase === "downloading";
    const showProgress = phase === "downloading";
    const isDone = phase === "up-to-date" || phase === "error";

    return (
        <View style={styles.root}>
            <StatusBar backgroundColor={C.bg} barStyle="light-content" />

            <Animated.View
                style={[StyleSheet.absoluteFill, styles.center, { opacity: fadeIn }]}
            >
                {/* ─── Background glow ────────────────── */}
                <Animated.View
                    style={[
                        styles.bgGlow,
                        { opacity: glowOpacity },
                    ]}
                />

                {/* ─── Orbit ring 1 ───────────────────── */}
                <Animated.View
                    style={[
                        styles.orbitRing,
                        {
                            width: ORBIT_SIZE,
                            height: ORBIT_SIZE,
                            borderRadius: ORBIT_SIZE / 2,
                            transform: [{ rotate: orbitRotation1 }],
                        },
                    ]}
                >
                    <View style={[styles.orbitDot, { top: -DOT_SIZE / 2, alignSelf: "center" }]} />
                </Animated.View>

                {/* ─── Orbit ring 2 ───────────────────── */}
                <Animated.View
                    style={[
                        styles.orbitRing2,
                        {
                            width: ORBIT_SIZE * 1.35,
                            height: ORBIT_SIZE * 1.35,
                            borderRadius: (ORBIT_SIZE * 1.35) / 2,
                            transform: [{ rotate: orbitRotation2 }],
                        },
                    ]}
                >
                    <View style={[styles.orbitDot2, { top: -DOT_SIZE / 2 + 1, alignSelf: "center" }]} />
                </Animated.View>

                {/* ─── Floating particles ─────────────── */}
                {particleAnims.map((p, i) => (
                    <Animated.View
                        key={`particle-${i}`}
                        style={[
                            styles.particle,
                            {
                                opacity: p.opacity,
                                transform: [
                                    { translateX: p.x },
                                    { translateY: p.y },
                                ],
                            },
                        ]}
                    />
                ))}

                {/* ─── Logo ───────────────────────────── */}
                <Animated.View
                    style={[
                        styles.logoContainer,
                        {
                            transform: [
                                { scale: Animated.multiply(logoScale, logoPulse) },
                            ],
                        },
                    ]}
                >
                    <Animated.Image
                        source={require("@/assets/logo.png")}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>

                {/* ─── Status card ─────────────────────── */}
                <Animated.View
                    style={[styles.statusCard, { opacity: statusFade }]}
                >
                    {/* Phase icon */}
                    <View style={styles.phaseIconRow}>
                        <View
                            style={[
                                styles.phaseIndicator,
                                isDone && phase === "up-to-date" && styles.phaseIndicatorSuccess,
                                phase === "error" && styles.phaseIndicatorError,
                            ]}
                        >
                            <Animated.Text style={styles.phaseIconText}>
                                {phase === "checking"
                                    ? "⟳"
                                    : phase === "downloading"
                                        ? "↓"
                                        : phase === "ready"
                                            ? "✦"
                                            : phase === "up-to-date"
                                                ? "✓"
                                                : "✕"}
                            </Animated.Text>
                        </View>
                    </View>

                    {/* Status text */}
                    <Animated.Text style={styles.statusTitle}>
                        {phaseLabels[phase]}
                    </Animated.Text>
                    <Animated.Text style={styles.statusSub}>
                        {phaseSubLabels[phase]}
                    </Animated.Text>

                    {/* ─── Progress bar ───────────────── */}
                    {showProgress && (
                        <View style={styles.progressContainer}>
                            <View style={styles.progressTrack}>
                                <Animated.View
                                    style={[
                                        styles.progressFill,
                                        { width: barWidthInterp },
                                    ]}
                                >
                                    <View style={styles.progressShimmer} />
                                </Animated.View>
                            </View>
                        </View>
                    )}

                    {/* ─── Loading dots ───────────────── */}
                    {isLoading && !showProgress && (
                        <View style={styles.dotsRow}>
                            {[0, 1, 2].map((i) => (
                                <LoadingDot key={i} delay={i * 250} />
                            ))}
                        </View>
                    )}
                </Animated.View>

                {/* ─── Apply button ────────────────────── */}
                {phase === "ready" && (
                    <Animated.View
                        style={[
                            styles.buttonWrapper,
                            {
                                opacity: buttonOpacity,
                                transform: [{ translateY: buttonSlide }],
                            },
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.applyButton}
                            onPress={handleApply}
                            activeOpacity={0.85}
                        >
                            <Animated.Text style={styles.applyText}>
                                Apply Update
                            </Animated.Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.skipButton}
                            onPress={handleSkip}
                            activeOpacity={0.7}
                        >
                            <Animated.Text style={styles.skipText}>
                                Skip for now
                            </Animated.Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* ─── Version footer ─────────────────── */}
                <Animated.Text style={[styles.versionText, { opacity: statusFade }]}>
                    NextVibe · OTA Updates
                </Animated.Text>
            </Animated.View>
        </View>
    );
}

// ── Loading dot sub-component ──────────────────────────────────
function LoadingDot({ delay }: { delay: number }) {
    const anim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(anim, {
                    toValue: 0.3,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    return (
        <Animated.View
            style={[
                styles.dot,
                { opacity: anim },
            ]}
        />
    );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: C.bg,
    },
    center: {
        alignItems: "center",
        justifyContent: "center",
    },

    // Background glow
    bgGlow: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: C.glow,
    },

    // Orbit rings
    orbitRing: {
        position: "absolute",
        borderWidth: 1,
        borderColor: "rgba(139, 92, 246, 0.18)",
        borderStyle: "dashed",
        alignItems: "center",
    },
    orbitRing2: {
        position: "absolute",
        borderWidth: 1,
        borderColor: "rgba(217, 70, 239, 0.12)",
        borderStyle: "dashed",
        alignItems: "center",
    },
    orbitDot: {
        position: "absolute",
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: C.violetLight,
        shadowColor: C.violetLight,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 6,
    },
    orbitDot2: {
        position: "absolute",
        width: DOT_SIZE - 2,
        height: DOT_SIZE - 2,
        borderRadius: (DOT_SIZE - 2) / 2,
        backgroundColor: C.fuchsia,
        shadowColor: C.fuchsia,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 5,
        elevation: 5,
    },

    // Particles
    particle: {
        position: "absolute",
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.purple,
    },

    // Logo
    logoContainer: {
        width: 88,
        height: 88,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 48,
    },
    logo: {
        width: 72,
        height: 72,
    },

    // Status card
    statusCard: {
        width: SCREEN_W * 0.82,
        backgroundColor: C.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(139, 92, 246, 0.15)",
        paddingVertical: 32,
        paddingHorizontal: 24,
        alignItems: "center",
    },

    // Phase indicator
    phaseIconRow: {
        marginBottom: 16,
    },
    phaseIndicator: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(109, 40, 217, 0.2)",
        borderWidth: 1,
        borderColor: "rgba(139, 92, 246, 0.3)",
        alignItems: "center",
        justifyContent: "center",
    },
    phaseIndicatorSuccess: {
        backgroundColor: C.successBg,
        borderColor: "rgba(52, 211, 153, 0.3)",
    },
    phaseIndicatorError: {
        backgroundColor: "rgba(239, 68, 68, 0.12)",
        borderColor: "rgba(239, 68, 68, 0.3)",
    },
    phaseIconText: {
        fontSize: 20,
        color: C.text,
    },

    // Status texts
    statusTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: C.text,
        marginBottom: 6,
        textAlign: "center",
    },
    statusSub: {
        fontSize: 13,
        color: C.textSecondary,
        textAlign: "center",
        letterSpacing: 0.3,
    },

    // Progress bar
    progressContainer: {
        width: "100%",
        marginTop: 24,
    },
    progressTrack: {
        width: "100%",
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(75, 61, 114, 0.4)",
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 3,
        backgroundColor: C.violetLight,
        overflow: "hidden",
    },
    progressShimmer: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 30,
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        borderRadius: 3,
    },

    // Loading dots
    dotsRow: {
        flexDirection: "row",
        marginTop: 20,
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.violetLight,
    },

    // Buttons
    buttonWrapper: {
        marginTop: 28,
        alignItems: "center",
        gap: 12,
    },
    applyButton: {
        width: SCREEN_W * 0.7,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.violet,
        shadowColor: C.purple,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    applyText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#fff",
        letterSpacing: 0.8,
    },
    skipButton: {
        paddingVertical: 8,
        paddingHorizontal: 24,
    },
    skipText: {
        fontSize: 13,
        color: C.muted,
        letterSpacing: 0.5,
    },

    // Footer
    versionText: {
        position: "absolute",
        bottom: 40,
        fontSize: 11,
        color: C.muted,
        letterSpacing: 1.5,
    },
});
