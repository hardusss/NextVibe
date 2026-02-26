import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FlaskConical } from "lucide-react-native";

interface DevnetBannerProps {
    isDarkMode: boolean;
}

const DevnetBanner: React.FC<DevnetBannerProps> = ({ isDarkMode }) => {
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    const border = isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
    const color = isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)";

    return (
        <View style={[styles.container, { backgroundColor: bg, borderColor: border }]}>
            <FlaskConical size={13} color={color} strokeWidth={1.5} />
            <Text style={[styles.text, { color }]}>devnet</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        marginTop: 10,
        marginBottom: 4,
    },
    text: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        letterSpacing: 1.5,
        includeFontPadding: false,
    },
});

export default DevnetBanner;