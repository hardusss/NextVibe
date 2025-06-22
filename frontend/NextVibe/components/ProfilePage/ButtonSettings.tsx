import { Pressable, Text, StyleSheet, Animated, Dimensions} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";


const screenWidth = Dimensions.get("window").width;
const ButtonSsetings = () => {
    const [scale] = useState(new Animated.Value(1));
    const router = useRouter();
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
        router.push("/settings")
    };

    return (
        <Animated.View style={[{ transform: [{ scale }] }]}>
            <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: pressed ? "rgb(48, 28, 60)" : "#3B0971" }, //rgb(6, 174, 157)
                ]}
            >
                <Text style={styles.text}>Settings</Text>
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        width: (screenWidth * 0.45) - 15,
        height: 40,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 8,
    },
    text: {
        color: "white",
        fontWeight: "bold",
        fontSize: 14,
    }
});

export default ButtonSsetings;
