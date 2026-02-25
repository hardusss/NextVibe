import { TouchableOpacity, Animated, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import usePortfolio from "@/hooks/usePortfolio";
import { WalletMinimal } from "lucide-react-native"


const ButtonWallet = () => {
    const router = useRouter();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const { data, isLoading } = usePortfolio();

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.delay(1000),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    const translateX = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-100, 200],
    });

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
        }).start();
        router.push("/wallet-select");
    };

    const formattedBalance = data?.totalUsdBalance 
        ? `${data.totalUsdBalance.toFixed(2)} USD` 
        : "Connect";

    return (
        <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
            >
                <LinearGradient
                    colors={["#6A00F4", "#8100dd"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.badge}
                >
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            { transform: [{ translateX }] }
                        ]}
                    >
                        <LinearGradient
                            colors={["transparent", "rgba(255,255,255,0.3)", "transparent"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ flex: 1, transform: [{ skewX: "-20deg" }] }}
                        />
                    </Animated.View>

                    <WalletMinimal color="white" size={18} />
                    
                    {isLoading ? (
                        <View style={styles.skeleton} />
                    ) : (
                        <Text style={styles.balanceText}>{data ? `${formattedBalance}` : "Connect"}</Text>
                    )}
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignSelf: "flex-start",
        marginRight: 10,
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        overflow: "hidden",
        gap: 8,
        minWidth: 90,
        height: 34,
    },
    balanceText: {
        color: "white",
        fontSize: 13,
        fontWeight: "700",
        zIndex: 1,
    },
    skeleton: {
        width: 60,
        height: 14,
        backgroundColor: "rgba(0,0,0,0.2)",
        borderRadius: 4,
    },
});

export default ButtonWallet;