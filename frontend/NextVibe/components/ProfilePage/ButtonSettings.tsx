import {Animated, TouchableOpacity, useColorScheme} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const ButtonSsetings = () => {
    const [scale] = useState(new Animated.Value(1));
    const isDark = useColorScheme() === "dark" 
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
        <Animated.View style={[{marginRight: 10}, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
            >
                <MaterialCommunityIcons name="menu" color={isDark ? "#c9d1d9" : "black"} size={25}/>
            </TouchableOpacity>
        </Animated.View>
    );
};


export default ButtonSsetings;
