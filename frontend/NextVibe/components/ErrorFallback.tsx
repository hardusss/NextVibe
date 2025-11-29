import { LinearGradient } from "expo-linear-gradient";
import { View, Text, TouchableOpacity, useColorScheme, StyleSheet, StatusBar, Linking, ScrollView } from "react-native";
import LottieView from "lottie-react-native";
import { MaterialIcons } from "@expo/vector-icons";

interface ErrorFallbackProps {
    error: Error;
    resetError: () => void;
}

export default function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
    const isDark = useColorScheme() === "dark";

    const theme = {
        text: isDark ? "#fafafa" : "#111827",
        textSecondary: isDark ? "#A09CB8" : "#374151",
        primaryButton: isDark ? '#A78BFA' : '#5856D6',
        secondaryButtonText: isDark ? '#A78BFA' : '#5856D6',
        errorText: isDark ? '#ff6b6b' : '#dc2626',
        cardBackground: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"
    };

    const handleRestart = async () => {
        resetError();
        
    };

    const handleContactSupport = () => {
        Linking.openURL("https://nextvibe.io");
    };

    return (
        <LinearGradient
            colors={
                isDark
                ? ['#0A0410', '#1a0a2e', '#0A0410']
                : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
            }
            style={styles.container}
        >
             <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"} barStyle={isDark ? "light-content" : "dark-content"}/> 
            
            <View style={styles.contentContainer}>
                <LottieView
                    source={require("../assets/lottie/error.json")} 
                    autoPlay
                    loop
                    style={styles.lottie}
                />

                <Text style={[styles.title, { color: theme.text }]}>
                    Oops! Something went wrong
                </Text>

                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    The app encountered an unexpected error. We're sorry for the inconvenience.
                </Text>

                <View style={[styles.errorBox, { backgroundColor: theme.cardBackground }]}>
                    <Text style={[styles.errorText, { color: theme.errorText }]} numberOfLines={3}>
                        {error.toString()}
                    </Text>
                </View>

                <Text style={[styles.subtitle, { color: theme.textSecondary, fontSize: 14, marginTop: 10 }]}>
                    Please try restarting the app. If this keeps happening, let us know.
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={[styles.primaryButton, { backgroundColor: theme.primaryButton }]}
                    onPress={handleRestart}
                >
                    <MaterialIcons name="refresh" size={22} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryButtonText}>Restart App</Text>
                </TouchableOpacity>

                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={styles.secondaryButton}
                    onPress={handleContactSupport}
                >
                    <MaterialIcons name="bug-report" size={20} color={theme.secondaryButtonText} style={{ marginRight: 6 }} />
                    <Text style={[styles.secondaryButtonText, { color: theme.secondaryButtonText }]}>
                        Report to Developers
                    </Text>
                </TouchableOpacity>
            </View>
            
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between', 
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 60,
    },
    contentContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: 'center',
    },
    lottie: {
        width: 200, 
        height: 200,
        marginBottom: 20,
    },
    title: {
        fontWeight: "800",
        fontSize: 26,
        textAlign: "center",
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        textAlign: "center",
        lineHeight: 24,
        opacity: 0.9,
    },
    errorBox: {
        width: '100%',
        padding: 12,
        borderRadius: 12,
        marginTop: 20,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,0,0,0.1)'
    },
    errorText: {
        fontSize: 12,
        textAlign: 'center',
        fontFamily: 'monospace'
    },
    buttonContainer: {
        width: '100%',
        alignItems: 'center',
    },
    primaryButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        flexDirection: 'row',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButton: {
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    }
});