import React, { useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Radar, Users } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSpring,
    withSequence,
    Easing
} from "react-native-reanimated";

const DARK = {
    bg: "#0A0410",
    card: "rgba(168, 85, 247, 0.08)",
    cardBorder: "rgba(168, 85, 247, 0.25)",
    title: "#FFFFFF",
    description: "rgba(255,255,255,0.55)",
    highlight: "#A855F7",
    btnBg: "#A855F7",
    btnText: "#FFFFFF",
    icon: "#A855F7",
    cardIcon: "rgba(168, 85, 247, 0.15)",
};

const LIGHT = {
    bg: "#F5F0FF",
    card: "rgba(168, 85, 247, 0.07)",
    cardBorder: "rgba(168, 85, 247, 0.2)",
    title: "#1A0533",
    description: "rgba(26,5,51,0.55)",
    highlight: "#7C3AED",
    btnBg: "#7C3AED",
    btnText: "#FFFFFF",
    icon: "#7C3AED",
    cardIcon: "rgba(124, 58, 237, 0.12)",
};

const HexagonShape = ({ color, children }: { color: any, children: any }) => {
    return (
        <View style={styles.hexagonContainer}>
            <View style={[styles.hexShape, { backgroundColor: color }]} />
            <View style={[styles.hexShape, styles.hex60, { backgroundColor: color }]} />
            <View style={[styles.hexShape, styles.hexNeg60, { backgroundColor: color }]} />
            <View style={styles.iconCenter}>
                {children}
            </View>
        </View>
    );
};

export default function VibeMapScreen() {
    const router = useRouter();
    const scheme = useColorScheme();
    const t = scheme === "dark" ? DARK : LIGHT;

    // --- Reanimated Значення ---
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(30);

    useEffect(() => {
        // 1. Анімація пульсації гексагона (безкінечна)
        scale.value = withRepeat(
            withSequence(
                withTiming(1.1, {
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease)
                }),
                withTiming(1, {
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease)
                })
            ),
            -1,
            true
        );

        opacity.value = withTiming(1, { duration: 1000 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 120 });
    }, []);

    const rContentStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ translateY: translateY.value }],
        };
    });

    const rHexagonStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
        };
    });

    const handlePress = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/profile");
    };

    return (
        <View style={[styles.container, { backgroundColor: t.bg }]}>
            <StatusBar
                style={scheme === "dark" ? "light" : "dark"}
                backgroundColor={t.bg}
                translucent={false}
            />

            <Animated.View style={[styles.content, rContentStyle]}>
                <Animated.View
                    style={[
                        styles.hexagonPulseWrapper,
                        rHexagonStyle,
                        {
                            shadowColor: t.icon,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.6,
                            shadowRadius: 25,
                            elevation: 12,
                        }
                    ]}
                >
                    <HexagonShape color={t.icon + "12"}>
                        <Radar color={t.icon} size={50} strokeWidth={1.3} />
                    </HexagonShape>
                </Animated.View>

                <Text style={[styles.title, { color: t.title, fontFamily: "Dank Mono Bold" }]}>
                    VibeMap{"\n"}is coming
                </Text>

                <Text style={[styles.description, { color: t.description, fontFamily: "Dank Mono" }]}>
                    We're building something special. While we prepare the map, start growing your squad.
                </Text>

                <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                    <View style={[styles.cardIconBadge, { backgroundColor: t.cardIcon }]}>
                        <Users color={t.highlight} size={20} strokeWidth={1.8} />
                    </View>
                    <Text style={[styles.cardText, { color: t.title, fontFamily: "Dank Mono" }]}>
                        Invite{" "}
                        <Text style={{ color: t.highlight, fontFamily: "Dank Mono Bold" }}>
                            more than 5 friends
                        </Text>{" "}
                        to unlock early map access.
                    </Text>
                </View>

                <TouchableOpacity
                    activeOpacity={0.82}
                    style={[
                        styles.button,
                        {
                            backgroundColor: t.btnBg,
                            shadowColor: t.btnBg,
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.35,
                            shadowRadius: 10,
                            elevation: 6,
                        }
                    ]}
                    onPress={handlePress}
                >
                    <Text style={[styles.buttonText, { color: t.btnText, fontFamily: "Dank Mono Bold" }]}>
                        Go to Profile
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const HEX_SIZE = 112;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
    },
    content: {
        alignItems: "center",
        width: "100%",
    },
    hexagonPulseWrapper: {
        width: HEX_SIZE,
        height: HEX_SIZE,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 44,
    },
    hexagonContainer: {
        width: HEX_SIZE,
        height: HEX_SIZE,
        alignItems: "center",
        justifyContent: "center",
    },
    hexShape: {
        position: "absolute",
        width: HEX_SIZE * 0.95, 
        height: HEX_SIZE * 0.95,
        borderRadius: 20, 
    },
    hex60: {
        transform: [{ rotate: "60deg" }],
    },
    hexNeg60: {
        transform: [{ rotate: "-60deg" }],
    },
    iconCenter: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: 32,
        textAlign: "center",
        lineHeight: 40,
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    description: {
        fontSize: 15,
        textAlign: "center",
        lineHeight: 24,
        marginBottom: 32,
        maxWidth: 300,
    },
    card: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 20,
        marginBottom: 40,
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    cardIconBadge: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    cardText: {
        fontSize: 14,
        lineHeight: 22,
        flex: 1,
    },
    button: {
        width: "100%",
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: "center",
    },
    buttonText: {
        fontSize: 16,
        letterSpacing: 0.3,
    },
});