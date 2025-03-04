import { Pressable, Text, StyleSheet, Animated, Dimensions} from "react-native";
import { useState } from "react";
const screenWidth = Dimensions.get("window").width;
const ButtonSsetings = () => {
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
        <Animated.View style={[{ transform: [{ scale }] }]}>
            <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: pressed ? "#0b124c" : "#0d1663" },
                ]}
            >
                <Text style={styles.text}>Settings</Text>
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        width: screenWidth * 0.43,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 8,
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
    }
});

export default ButtonSsetings;
