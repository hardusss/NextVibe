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
import { clearPendingIntent, intentOwnsNavigation, whenIntentHydrated } from "@/src/navigation/pendingIntent";
import { OTA_CHECK_TIMEOUT_MS, useAppReadyStore } from "@/src/navigation/appReadyStore";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

/** Splash stays up at least this long (the logo animation). */
const MIN_SPLASH_MS = 2400;
/** If a pending intent hasn't taken the screen by then, go home anyway. */
const INTENT_WATCHDOG_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
}


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

    const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const redirectTo = async (isCancelled: () => boolean) => {
        const boot = useAppReadyStore.getState();
        try {
            const token = await storage.getItem("access");
            if (isCancelled()) return;
            if (token) {
                const status = await getStatusProfile();
                if (isCancelled()) return;
                boot.setAuthStatus("in");
                boot.markBootstrapDone();
                if (status?.ban) { clearPendingIntent(); router.replace("/user-banned"); return; }
                if (intentOwnsNavigation()) {
                    // A push tap / deep link is waiting: the root layout opens it
                    // as soon as the profile is loaded. Going home here is what
                    // bounced people off the profile a few seconds after a tap.
                    walletLogger.info(WalletTag.NAV_INTENT, "Splash: pending intent owns navigation; not going home");
                    watchdogRef.current = setTimeout(() => {
                        if (isCancelled() || intentOwnsNavigation()) return;
                        walletLogger.warn(WalletTag.NAV_INTENT, "Splash: intent never navigated; going home");
                        router.replace("/home");
                    }, INTENT_WATCHDOG_MS);
                    return;
                }
                router.replace("/home");
            } else {
                boot.setAuthStatus("out");
                boot.markBootstrapDone();
                router.replace("/register");
            }
        } catch (e) {
            if (isCancelled()) return;
            boot.markBootstrapDone();
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
        const isCancelled = () => cancelled;
        const startedAt = Date.now();

        const checkUpdateAndRedirect = async () => {
            // A tap from before an OTA reload is read back from storage here.
            await whenIntentHydrated(500);

            let updateAvailable = false;
            const boot = useAppReadyStore.getState();
            // Only once per launch: coming back from /eas-update must not loop.
            if (!__DEV__ && !boot.otaSettled) {
                try {
                    const check = await withTimeout(Updates.checkForUpdateAsync(), OTA_CHECK_TIMEOUT_MS);
                    if (check === null) {
                        console.log("[Splash] Update check timed out; continuing");
                    } else if (check.isAvailable) {
                        updateAvailable = true;
                    }
                } catch (err) {
                    console.log("[Splash] Update check failed/skipped:", err);
                }
            }
            boot.markOtaSettled();

            const rest = MIN_SPLASH_MS - (Date.now() - startedAt);
            if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest));
            if (cancelled) return;

            if (updateAvailable && intentOwnsNavigation()) {
                // Don't restart the app under a push tap / deep link. With
                // checkOnLaunch=ALWAYS expo-updates downloads the update in the
                // background already; it applies on the next launch.
                walletLogger.info(WalletTag.NAV_INTENT, "Splash: update available but an intent is pending; applying on next launch");
                updateAvailable = false;
            }

            if (updateAvailable) {
                router.replace("/eas-update");
            } else {
                await redirectTo(isCancelled);
            }
        };

        checkUpdateAndRedirect();

        return () => {
            cancelled = true;
            if (watchdogRef.current) clearTimeout(watchdogRef.current);
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