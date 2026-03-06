import { TouchableOpacity, Animated, StyleSheet, Text } from "react-native";
import { useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";

interface ButtonCollectProps {
    onPress: () => void;
}

const ButtonCollect = ({ onPress }: ButtonCollectProps) => {
    const scale = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.delay(1000),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    const translateX = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 200] });

    return (
        <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
                onPress={onPress}
                activeOpacity={0.9}
            >
                <LinearGradient colors={["#401f6c", "#8100dd"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
                    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
                        <LinearGradient
                            colors={["transparent", "rgba(255,255,255,0.3)", "transparent"]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ flex: 1, transform: [{ skewX: "-20deg" }] }}
                        />
                    </Animated.View>
                    <Sparkles color="rgb(216, 216, 217)" size={18} />
                    <Text style={styles.balanceText}>Collect</Text>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: { alignSelf: "flex-start", marginRight: -5 },
    badge: {
        flexDirection: "row", alignItems: "center",
        paddingVertical: 6, paddingHorizontal: 12,
        borderRadius: 20, overflow: "hidden",
        gap: 8, minWidth: 90, height: 34,
    },
    balanceText: { color: "white", fontSize: 13, includeFontPadding: false, zIndex: 1 },
});

export default ButtonCollect;