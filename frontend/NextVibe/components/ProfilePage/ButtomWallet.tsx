import { Pressable, Text, StyleSheet, Animated, View, Dimensions } from "react-native";
import { useState } from "react";

const screenWidth = Dimensions.get("window").width;
const ButtonWallet = () => {
    const [scale] = useState(new Animated.Value(1));

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
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
                    { backgroundColor: pressed ? "#5A31F4" : "#4518f0" },
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
        width: screenWidth * 0.43,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 8,
        position: "relative",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 1, 
    },
    text: {
        color: "white",
        fontWeight: "bold",
        fontSize: 14,
    },
    badge: {
        position: "absolute",
        top: -10,
        right: -2,
        backgroundColor: "#FF2E63",
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
