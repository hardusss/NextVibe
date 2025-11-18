import { LinearGradient } from "expo-linear-gradient";
import { View, Text, TouchableOpacity, useColorScheme, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import LottieView from "lottie-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useEffect } from "react";
export default function UserBannedPage() {
    const isDark = useColorScheme() === "dark";
    const router = useRouter(); 

    const theme = {
        background: isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'],
        text: isDark ? "#fafafa" : "#111827",
        textSecondary: isDark ? "#A09CB8" : "#374151",
        primaryButton: isDark ? '#A78BFA' : '#5856D6',
        logoutText: isDark ? '#fd0000ff' : '#E74C3C',
    };

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
            offlineAccess: true,
        });
    }, []);

    const handleLogout = () => {
        AsyncStorage.clear()
        GoogleSignin.signOut()
        router.replace("/register")
    };

    const handleAppeal = () => {
        console.log("Appeal pressed");
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
             <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"}/> 
            
            <View style={styles.contentContainer}>
                <LottieView
                    source={require("../assets/lottie/sad_emotion.json")}
                    autoPlay
                    loop
                    style={styles.lottie}
                />

                <Text style={[styles.title, { color: theme.text }]}>
                    Oops! Account Suspended
                </Text>

                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    We noticed activity that goes against our community guidelines.
                </Text>

                <Text style={[styles.subtitle, { color: theme.text, marginTop: 12 }]}>
                    Don’t worry, <Text style={[styles.reassuranceText, { color: theme.text, marginTop: 12 }]}>your account has not been deleted.</Text>
                </Text>

                <Text style={[styles.subtitle, { color: theme.textSecondary, marginTop: 12 }]}>
                    Your profile is just temporarily hidden and unavailable.
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <TouchableOpacity 
                    style={[styles.primaryButton, { backgroundColor: theme.primaryButton }]}
                    onPress={handleAppeal}
                >
                    <Text style={styles.primaryButtonText}>Appeal Decision</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.secondaryButton}
                    onPress={handleLogout}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.logoutText }]}>Logout</Text>
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
    },
    contentContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: 'center',
    },
    lottie: {
        width: 280, 
        height: 280,
        marginBottom: 16,
    },
    title: {
        fontWeight: "800",
        fontSize: 28,
        textAlign: "center",
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 17,
        textAlign: "center",
        lineHeight: 25,
        opacity: 0.9,
    },
    reassuranceText: {
        fontSize: 17,
        textAlign: "center",
        lineHeight: 25,
        fontWeight: '600',
        marginTop: 24,
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
        marginBottom: 16,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButton: {
        paddingVertical: 10,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    }
});