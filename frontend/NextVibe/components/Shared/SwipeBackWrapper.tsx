import React, { useEffect } from "react";
import { View, Platform } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter, usePathname } from "expo-router";
import { runOnJS } from "react-native-reanimated";

// Global array to track tab visit history across tabs
const tabHistory: string[] = [];
let isNavigatingBack = false;

export function SwipeBackWrapper({ children }: { children: React.ReactNode }) {
    if (Platform.OS !== "ios") {
        return <>{children}</>;
    }

    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const tabPaths = ["/home", "/search", "/vibe-map", "/profile"];
        if (tabPaths.includes(pathname)) {
            if (isNavigatingBack) {
                isNavigatingBack = false;
                return;
            }
            // Push path to history, avoiding consecutive duplicates
            if (tabHistory.length === 0 || tabHistory[tabHistory.length - 1] !== pathname) {
                tabHistory.push(pathname);
                // Keep history size reasonable (e.g. last 20 entries)
                if (tabHistory.length > 20) {
                    tabHistory.shift();
                }
            }
        }
    }, [pathname]);

    const handleBack = () => {
        if (tabHistory.length > 1) {
            tabHistory.pop(); // Remove current tab
            const prevPath = tabHistory[tabHistory.length - 1];
            if (prevPath) {
                isNavigatingBack = true;
                router.navigate(prevPath as any);
            }
        } else {
            // If no tab history exists, fallback to standard back behavior if possible
            if (router.canGoBack()) {
                router.back();
            }
        }
    };

    const swipeGesture = Gesture.Pan()
        .activeOffsetX([0, 10])
        .failOffsetY([-50, 50])
        .onEnd((e) => {
            const startX = e.absoluteX - e.translationX;
            const startedAtEdge = startX < 75;
            const swipedFarEnough = e.translationX > 80;
            const isFlick = e.velocityX > 400;

            if (startedAtEdge && (swipedFarEnough || isFlick)) {
                runOnJS(handleBack)();
            }
        });

    return (
        <GestureDetector gesture={swipeGesture}>
            <View style={{ flex: 1 }}>
                {children}
            </View>
        </GestureDetector>
    );
}
