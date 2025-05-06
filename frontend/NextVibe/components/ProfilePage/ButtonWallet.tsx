import { Pressable, Text, StyleSheet, Animated, View, Dimensions } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";


const screenWidth = Dimensions.get("window").width;
const ButtonWallet = () => {
    const router = useRouter();
    const [scale] = useState(new Animated.Value(1));

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        router.push("/create-wallet");
        Animated.spring(scale, {
            toValue: 1,
            friction: 3,
            useNativeDriver: true,
        }).start();
    };

    return (
        <Animated.View style={[styles.buttonWrapper, { transform: [{ scale }] }]}>
            <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: pressed ? "black" : "black" },
                ]}
            >
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>NEW</Text>
                </View>

                <Text style={styles.text}>Wallet</Text>
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    buttonWrapper: {
        alignItems: "center",
    },
    button: {
        width: (screenWidth * 0.45) - 15,
        height: 40,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 8,
        borderColor: "#05f0d8",
        borderWidth: 2,
        position: "relative",
        backgroundColor: "transparent",
    },
    text: {
        color: "#05f0d8",
        fontWeight: "bold",
        fontSize: 14,
    },
    badge: {
        position: "absolute",
        top: -10,
        right: -2,
        backgroundColor: "red",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeText: {
        color: "white",
        fontSize: 12,
        fontWeight: "bold",
    },
});

export default ButtonWallet;
