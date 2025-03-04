import React from "react";
import { View, StyleSheet, Dimensions, StatusBar } from "react-native";
import LottieView from "lottie-react-native";
import { useRouter } from "expo-router";


const {width, height} = Dimensions.get("window")


export default function SplashScreen() {
    const router = useRouter();
    const finishSplash = () => {
        setTimeout(() => {
            router.push("/profile")
        }, 1000)
    }
    return (
    <View style={styles.container}>
        <StatusBar backgroundColor="black" />
            <LottieView
                source={require("../assets/lottie/splash.json")}
                autoPlay
                loop={false}
                style={styles.lottie}
                onAnimationFinish={finishSplash}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "black",
    },
    lottie: {
        width: width ,
        height: height,
    },
    text: {
        marginTop: 20,
        fontSize: 20,
    },
});
