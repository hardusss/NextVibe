import { TouchableOpacity, Animated, StyleSheet, Text } from "react-native";
import { useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, CheckCircle, Lock } from "lucide-react-native";

/** Visual state of the collect button */
export type CollectState = "collect" | "claimed" | "soldout";

interface ButtonCollectProps {
    onPress: () => void;
    /** Current NFT state — controls appearance and interactivity */
    state?: CollectState;
    /** e.g. "50/50" shown on sold out */
    supplyLabel?: string;
}

const ButtonCollect = ({ onPress, state = "collect", supplyLabel }: ButtonCollectProps) => {
    const scale = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    const isInteractive = state === "collect";

    useEffect(() => {
        if (state !== "collect") return;
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.delay(1000),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [state]);

    const translateX = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 200] });

    const gradientColors: [string, string] =
        state === "claimed"
            ? ["#14532d", "#16a34a"]
            : state === "soldout"
                ? ["#1c1c1e", "#2c2c2e"]
                : ["#401f6c", "#8100dd"];

    const icon =
        state === "claimed"
            ? <CheckCircle color="#4ade80" size={15} />
            : state === "soldout"
                ? <Lock color="#6b7280" size={15} />
                : <Sparkles color="rgb(216,216,217)" size={15} />;

    const label =
        state === "claimed"
            ? "Collected"
            : state === "soldout"
                ? `Sold out${supplyLabel ? ` ${supplyLabel}` : ""}`
                : "Collect";

    const textColor =
        state === "claimed" ? "#4ade80"
            : state === "soldout" ? "#6b7280"
                : "white";

    return (
        <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={() => {
                    if (!isInteractive) return;
                    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
                }}
                onPressOut={() => {
                    if (!isInteractive) return;
                    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
                }}
                onPress={() => { if (isInteractive) onPress(); }}
                activeOpacity={isInteractive ? 0.9 : 1}
            >
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.badge, state === "soldout" && styles.badgeSoldOut]}
                >
                    {/* Shimmer — only on collect state */}
                    {state === "collect" && (
                        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
                            <LinearGradient
                                colors={["transparent", "rgba(255,255,255,0.3)", "transparent"]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{ flex: 1, transform: [{ skewX: "-20deg" }] }}
                            />
                        </Animated.View>
                    )}
                    {icon}
                    <Text style={[styles.label, { color: textColor }]}>{label}</Text>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignSelf: "flex-start",
        marginRight: -5,
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        overflow: "hidden",
        gap: 6,
        height: 34,
    },
    badgeSoldOut: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    label: {
        fontSize: 13,
        includeFontPadding: false,
        zIndex: 1,
    },
});

export default ButtonCollect;