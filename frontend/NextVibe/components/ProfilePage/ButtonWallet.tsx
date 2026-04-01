import { TouchableOpacity, Animated, StyleSheet, Text, View, DimensionValue } from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import useWalletAddress from "@/hooks/useWalletAddress";
import { LinearGradient } from "expo-linear-gradient";
import usePortfolio from "@/hooks/usePortfolio";
import { WalletMinimal, ChevronRight } from "lucide-react-native"


const ButtonWallet = ( { 
    widthButton,
    page
}: {
    widthButton?: number | string,
    page?: string
} ) => {
    const router = useRouter();
    const scale = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const { data, isLoading } = usePortfolio();
    const { address } = useWalletAddress();
    const isFullWidth = widthButton === "100%";

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
        outputRange: [-100, 400],
    });

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.97,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
        }).start();
        if (address) {
            router.push("/wallet-dash")
        } else {
            router.push(page ? `/wallet-select?page=${page}` : "/wallet-select");
        }
    };

    const formattedBalance = data?.totalUsdBalance 
        ? `${data.totalUsdBalance.toFixed(2)} USD` 
        : "Connect";

    return (
        <Animated.View style={[
            styles.container,
            { transform: [{ scale }] },
            widthButton ? { width: widthButton as DimensionValue, alignSelf: "stretch" } : null
        ]}>
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
                style={isFullWidth ? { width: "100%" } : null}
            >
                <LinearGradient
                    colors={["#6A00F4", "#8100dd"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.badge, isFullWidth && styles.badgeFullWidth]}
                >
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            { transform: [{ translateX }] }
                        ]}
                    >
                        <LinearGradient
                            colors={["transparent", "rgba(255,255,255,0.25)", "transparent"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ flex: 1, transform: [{ skewX: "-20deg" }] }}
                        />
                    </Animated.View>

                    {/* Left: icon + label */}
                    <View style={isFullWidth ? styles.leftSection : styles.inlineSection}>
                        <View style={isFullWidth ? styles.iconWrap : null}>
                            <WalletMinimal color="white" size={isFullWidth ? 20 : 18} />
                        </View>
                        {isFullWidth && (
                            <Text style={styles.labelText}>My Wallet</Text>
                        )}
                    </View>

                    {/* Balance */}
                    {isLoading ? (
                        <View style={[styles.skeleton, isFullWidth && styles.skeletonFullWidth]} />
                    ) : (
                        <Text style={[styles.balanceText, isFullWidth && styles.balanceTextFullWidth]}>
                            {data ? formattedBalance : "Connect"}
                        </Text>
                    )}

                    {/* Right arrow only in full width */}
                    {isFullWidth && (
                        <ChevronRight color="rgba(255,255,255,0.5)" size={18} strokeWidth={2} />
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
    badgeFullWidth: {
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 16,
        justifyContent: "space-between",
        gap: 0,
    },
    inlineSection: {
        flexDirection: "row",
        alignItems: "center",
    },
    leftSection: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    iconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.15)",
        justifyContent: "center",
        alignItems: "center",
    },
    labelText: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
        letterSpacing: 0.5,
    },
    balanceText: {
        color: "white",
        fontSize: 13,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        zIndex: 1,
    },
    balanceTextFullWidth: {
        fontSize: 15,
        flex: 1,
        textAlign: "center",
    },
    skeleton: {
        width: 60,
        height: 14,
        backgroundColor: "rgba(0,0,0,0.2)",
        borderRadius: 4,
    },
    skeletonFullWidth: {
        flex: 1,
        height: 16,
        marginHorizontal: 12,
    },
});

export default ButtonWallet;