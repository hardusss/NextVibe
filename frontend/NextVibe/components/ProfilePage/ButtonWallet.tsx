import { Pressable, StyleSheet, Animated, Dimensions, Text } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

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
            <LinearGradient
                colors={["#05f0d8", "#0ff", "#05f0d8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBorder}
            >
                <Pressable
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    style={styles.innerButton}
                >
                    <MaskedView
                        maskElement={
                            <Text style={styles.text}>Wallet</Text>
                        }
                    >
                        <LinearGradient
                            colors={["#05f0d8", "#0ff"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ flex: 1 }}
                        />
                    </MaskedView>
                </Pressable>
            </LinearGradient>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    buttonWrapper: {
        alignItems: "center",
    },
    gradientBorder: {
        padding: 2,
        borderRadius: 8,
    },
    innerButton: {
        width: (screenWidth * 0.45) - 15,
        height: 40,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "black",
    },
    text: {
        fontWeight: "bold",
        fontSize: 14,
        textAlign: "center",
    },
});

export default ButtonWallet;
