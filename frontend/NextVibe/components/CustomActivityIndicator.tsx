import React from "react";
import { View, ActivityIndicator, ActivityIndicatorProps } from "react-native";
import LottieView from "lottie-react-native";

const CustomActivityIndicator = (props: ActivityIndicatorProps) => {
    return (
        <View style={[{ justifyContent: "center", alignItems: "center" }, props.style]}>
            <LottieView
                source={require("../assets/lottie/loader.json")} 
                autoPlay
                loop
                style={{ width: 100, height: 100 }}
            />
        </View>
    );
};


export { CustomActivityIndicator as ActivityIndicator };
