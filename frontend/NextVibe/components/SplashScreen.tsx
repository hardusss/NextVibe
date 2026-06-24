import React, { useEffect, useRef } from "react";
import {
    View,
    StyleSheet,
    StatusBar,
    Animated,
    Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { storage } from "@/src/utils/storage";
import getStatusProfile from "@/src/api/check.status";
import * as Updates from "expo-updates";


const C = {
    bg: "#0A0410",
    violet: "#6D28D9",
    line: "#2D1F52",
    text: "#C4B5FD",
    muted: "#4B3D72",
};

const BRACKET = 18; // corner bracket arm length
const FRAME = 112; // logo frame size

export default function SplashScreen() {
    const router = useRouter();

    // All animated values
    const fadeAll = useRef(new Animated.Value(0)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const bracketAnim = useRef(new Animated.Value(0)).current; // 0→1 draws brackets
    const lineAnim = useRef(new Animated.Value(0)).current;
    const nameOpacity = useRef(new Animated.Value(0)).current;
    const nameY = useRef(new Animated.Value(8)).current;
    const sloganOp = useRef(new Animated.Value(0)).current;

    const redirectTo = async () => {
        try {
            const token = await storage.getItem("access");
            if (token) {
                const status = await getStatusProfile();
                if (status?.ban) { router.replace("/user-banned"); return; }
                router.replace("/home");
            } else {
                router.replace("/register");
            }
        } catch (e) {
            router.replace("/register");
        }
    };

    useEffect(() => {
        Animated.sequence([
            // 1. BG
            Animated.timing(fadeAll, { toValue: 1, duration: 300, useNativeDriver: true }),
            // 2. Logo fade
            Animated.timing(logoOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            // 3. Brackets draw in
            Animated.timing(bracketAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            // 4. Line expands
            Animated.timing(lineAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            // 5. Name
            Animated.parallel([
                Animated.timing(nameOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
                Animated.timing(nameY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            // 6. Slogan
            Animated.timing(sloganOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();

        let cancelled = false;
        let updateAvailable = false;

        const checkUpdateAndRedirect = async () => {
            try {
                if (!__DEV__) {
                    const check = await Updates.checkForUpdateAsync();
                    if (check.isAvailable) {
                        updateAvailable = true;
                    }
                }
            } catch (err) {
                console.log("[Splash] Update check failed/skipped:", err);
            }

            await new Promise(resolve => setTimeout(resolve, 2400));
            if (cancelled) return;

            if (updateAvailable) {
                router.replace("/eas-update");
            } else {
                await redirectTo();
            }
        };

        checkUpdateAndRedirect();

        return () => {
            cancelled = true;
        };
    }, []);

    const bracketLen = bracketAnim.interpolate({ inputRange: [0, 1], outputRange: [0, BRACKET] });
    const lineWidth = lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 64] });

    // Corner bracket helper — renders an L-shape from 4 views
    const Corner = ({
        top, left, right, bottom, flipH, flipV,
    }: { top?: number; left?: number; right?: number; bottom?: number; flipH?: boolean; flipV?: boolean }) => (
        <View style={[styles.corner, { top, left, right, bottom }]}>
            {/* horizontal arm */}
            <Animated.View
                style={[
                    styles.bracketH,
                    flipH ? { right: 0 } : { left: 0 },
                    flipV ? { bottom: 0 } : { top: 0 },
                    { width: bracketLen },
                ]}
            />
            {/* vertical arm */}
            <Animated.View
                style={[
                    styles.bracketV,
                    flipH ? { right: 0 } : { left: 0 },
                    flipV ? { bottom: 0 } : { top: 0 },
                    { height: bracketLen },
                ]}
            />
        </View>
    );

    return (
        <View style={styles.root}>
            <StatusBar backgroundColor={C.bg} barStyle="light-content" />

            <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: fadeAll }]}>

                {/* Logo + corner brackets */}
                <View style={[styles.frame]}>
                    <Corner top={0} left={0} />
                    <Corner top={0} right={0} flipH />
                    <Corner bottom={0} left={0} flipV />
                    <Corner bottom={0} right={0} flipH flipV />

                    <Animated.Image
                        source={require("@/assets/logo.png")}
                        style={[styles.logo, { opacity: logoOpacity }]}
                        resizeMode="contain"
                    />
                </View>

                {/* Separator */}
                <Animated.View style={[styles.line, { width: lineWidth }]} />

                {/* Name */}
                <Animated.Text style={[styles.name, { opacity: nameOpacity, transform: [{ translateY: nameY }] }]}>
                    NextVibe
                </Animated.Text>

                {/* Slogan */}
                <Animated.Text style={[styles.slogan, { opacity: sloganOp }]}>
                    your firefly in the networking noise
                </Animated.Text>

            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: C.bg,
    },
    center: {
        alignItems: "center",
        justifyContent: "center",
    },

    // Logo frame
    frame: {
        width: FRAME,
        height: FRAME,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
    },
    logo: {
        width: 80,
        height: 80,
    },

    // Bracket arms
    corner: {
        position: "absolute",
        width: BRACKET,
        height: BRACKET,
    },
    bracketH: {
        position: "absolute",
        height: 1,
        backgroundColor: C.violet,
        opacity: 0.7,
    },
    bracketV: {
        position: "absolute",
        width: 1,
        backgroundColor: C.violet,
        opacity: 0.7,
    },

    // Separator
    line: {
        height: 1,
        backgroundColor: C.line,
        marginBottom: 20,
    },

    // Text
    name: {
        fontSize: 26,
        fontWeight: "300",
        color: C.text,
        letterSpacing: 10,
        textTransform: "uppercase",
        marginBottom: 10,
    },
    slogan: {
        fontSize: 11,
        color: C.muted,
        letterSpacing: 1.8,
        textAlign: "center",
        paddingHorizontal: 48,
        fontStyle: "italic",
    },
});