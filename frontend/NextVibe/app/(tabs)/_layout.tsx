import { RelativePathString, Stack, useRouter, useSegments } from "expo-router";
import { useColorScheme, View, TouchableOpacity, Text, TextInput, StyleSheet, Platform } from "react-native";
import React, { useEffect, useState } from "react";
import getUserDetail from "@/src/api/user.detail";
import FastImage from 'react-native-fast-image';
import { storage } from "@/src/utils/storage";
import { WebSocketProvider } from "@/src/context/WebSocketContext";
import axios from "axios";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";
import ErrorBoundary from 'react-native-error-boundary';
import ErrorFallback from "@/components/ErrorFallback";
import { BlurView } from "@react-native-community/blur";
import { LazorKitProvider } from '@lazorkit/wallet-mobile-adapter';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
// Icons
import { House, Search, BadgePlus, UserRound } from "lucide-react-native"
// WMA
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { clusterApiUrl } from '@solana/web3.js';
// PUSH
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants'
// Save token on backend
import savePushToken from "@/src/api/save.push.token";
import AsyncStorage from '@react-native-async-storage/async-storage';

// WMA settings
const chain = 'solana:devnet';
const endpoint = clusterApiUrl('devnet');
const identity = {
    name: 'NextVibe',
    uri: 'https://nextvibe.io',
    icon: 'logo.png',
};


SplashScreen.preventAutoHideAsync();

const defaultFontFamily = 'Dank Mono';
const boldFontFamily = 'Dank Mono Bold';

// @ts-ignore
const oldTextRender = Text.render;
// @ts-ignore
Text.render = function (...args) {
    const origin = oldTextRender.call(this, ...args);
    const style = StyleSheet.flatten(origin.props.style) || {};

    const isBold = style.fontWeight === 'bold' ||
        style.fontWeight === '600' ||
        style.fontWeight === '700' ||
        style.fontWeight === '800' ||
        style.fontWeight === '900' ||
        (typeof style.fontWeight === 'number' && style.fontWeight > 500);

    return React.cloneElement(origin, {
        style: [
            { fontFamily: isBold ? boldFontFamily : defaultFontFamily },
            origin.props.style
        ],
    });
};

// @ts-ignore
const oldTextInputRender = TextInput.render;
// @ts-ignore
TextInput.render = function (...args) {
    const origin = oldTextInputRender.call(this, ...args);
    const style = StyleSheet.flatten(origin.props.style) || {};

    const isBold = style.fontWeight === 'bold' || (typeof style.fontWeight === 'number' && style.fontWeight > 500);

    return React.cloneElement(origin, {
        style: [
            { fontFamily: isBold ? boldFontFamily : defaultFontFamily },
            origin.props.style
        ],
    });
};

if (__DEV__ && typeof global !== 'undefined') {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
        if (typeof args[0] === 'string' && (args[0].includes('getDevServer') || args[0].includes('getDevServer is not a function'))) return;
        originalError(...args);
    };

    console.warn = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('getDevServer')) return;
        originalWarn(...args);
    };
}

let cachedAvatarUrl: string | null = null;

export default function Layout() {
    const [fontsLoaded, fontError] = useFonts({
        'Dank Mono': require('@/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
        'Dank Mono Bold': require('@/assets/fonts/PlusJakartaSans-Bold.ttf'),
    });

    const theme = useColorScheme();
    const router = useRouter();
    const segments = useSegments();
    const currentPage = segments[segments.length - 1];
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const [userID, setUserID] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [visible, setVisible] = useState<boolean>(false);

    const blacklist = ["register", "login", "postslist",
        "splash", "index", "create-post",
        "settings", "select-token", "deposit",
        "transaction", "user-profile", "result-transaction",
        "transactions", "transaction-detail", "chat-room",
        "chats", "follows-screen", "notifications",
        "user-banned", "wallet-init", "wallet-dash",
        "wallet-select", "send"];

    const tabs = [
        { name: "home", IconOutline: House, IconFilled: House },
        { name: "search", IconOutline: Search, IconFilled: Search },
        { name: "camera", IconOutline: BadgePlus, IconFilled: BadgePlus },
        { name: "profile", IconOutline: UserRound, IconFilled: UserRound },
    ];

    // --------PUSH--------
    function handleRegistrationError(errorMessage: string) {
        setToastMessage(errorMessage);
        setVisible(true);
        throw new Error(errorMessage);
    }


    const PUSH_TOKEN_KEY = 'expo_push_token';

    async function registerForPushNotifications() {
        if (!Device.isDevice) {
            handleRegistrationError('Must use physical device for push notifications');
            return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            handleRegistrationError('Permission not granted to get push token for push notification!');
            return;
        }

        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

        if (!projectId) {
            handleRegistrationError('Project ID not found');
            return;
        }

        try {
            const pushTokenString = (
                await Notifications.getExpoPushTokenAsync({ projectId })
            ).data;

            const savedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);

            if (savedToken !== pushTokenString) {
                await savePushToken(pushTokenString);
                await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushTokenString);
            }

            return pushTokenString;
        } catch (e: unknown) {
            handleRegistrationError(`${e}`);
        }
    }

    useEffect(() => {
        // Get PUSH permission on Profile page
        if (segments[1] === "profile") {
            registerForPushNotifications();
        };
    }, [segments])


    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (res) => res,
            (error) => {
                if (error.response?.status === 429) {
                    setToastMessage("You exceeded the request limit!");
                    setVisible(true);
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    useEffect(() => {
        if (!userID) return;
        let isMounted = true;
        const fetchAvatar = async () => {
            try {
                const userData = await getUserDetail();
                const newAvatarUrl = userData.avatar || "https://media.nextvibe.io/images/default.png";
                if (isMounted && newAvatarUrl !== cachedAvatarUrl) {
                    FastImage.preload([{ uri: newAvatarUrl, priority: FastImage.priority.high }]);
                    cachedAvatarUrl = newAvatarUrl;
                    setImageProfile(newAvatarUrl);
                }
            } catch (e) { }
        };
        fetchAvatar();
        return () => { isMounted = false; };
    }, [userID]);

    if (!fontsLoaded && !fontError) return null;

    const goToTab = (tab: string) => router.push(tab as RelativePathString);
    const showTabBar = ![...blacklist, "camera"].includes(currentPage);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
                <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
                    <LazorKitProvider
                        rpcUrl="https://devnet.helius-rpc.com/?api-key=8b5d26aa-3554-4d0c-b716-c04029ca49c9"
                        portalUrl="https://portal.lazor.sh"
                        configPaymaster={{ paymasterUrl: "https://kora.devnet.lazorkit.com" }}
                    >
                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                            <WebSocketProvider userId={userID || 0}>
                                {toastMessage && (
                                    <Web3Toast message={toastMessage} visible={visible} onHide={() => setVisible(false)} isSuccess={false} />
                                )}
                                <View style={{ flex: 1, backgroundColor: theme === "dark" ? "#000" : "#fff" }}>
                                    <Stack screenOptions={{ headerShown: false, animation: "none" }} >
                                        <Stack.Screen name="home" />
                                        <Stack.Screen name="search" />
                                        <Stack.Screen name="camera" />
                                        <Stack.Screen name="profile" />
                                        {blacklist.map((item) => <Stack.Screen key={item} name={item} />)}
                                    </Stack>

                                    {showTabBar && (
                                        <View style={styles.tabBarContainer}>
                                            <BlurView blurType={theme === "dark" ? "dark" : "light"} blurAmount={10} style={StyleSheet.absoluteFill} />
                                            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme === "dark" ? "rgba(20, 8, 41, 0.4)" : "rgba(255, 255, 255, 0.4)" }]} />
                                            <View style={styles.tabsWrapper}>
                                                {tabs.map((tab) => {
                                                    const isActive = currentPage === tab.name;
                                                    const activeBgColor = theme === "dark"
                                                        ? "rgba(154, 109, 191, 0.15)"
                                                        : "rgba(0, 0, 0, 0.05)";
                                                    const iconColor = isActive
                                                        ? (theme === "dark" ? "#FFFFFF" : "#000000")
                                                        : (theme === "dark" ? "rgb(144, 141, 141)" : "rgb(0,0,0)");
                                                    const Icon = isActive ? tab.IconFilled : tab.IconOutline;

                                                    return (
                                                        <TouchableOpacity
                                                            key={tab.name}
                                                            onPress={() => goToTab(tab.name)}
                                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                        >
                                                            {tab.name === "profile" && imageProfile && userID ? (
                                                                <View style={styles.iconContainerProfile}>
                                                                    <FastImage
                                                                        source={{ uri: imageProfile }}
                                                                        style={[styles.avatar, { borderWidth: isActive ? 1 : 0 }]}
                                                                    />
                                                                </View>
                                                            ) : (
                                                                <View style={[
                                                                    styles.iconContainer,
                                                                    {
                                                                        backgroundColor: isActive ? activeBgColor : "transparent",
                                                                        borderColor: isActive ? "rgba(255,255,255,0.2)" : "transparent"
                                                                    }
                                                                ]}>
                                                                    <Icon size={24} color={iconColor} strokeWidth={isActive ? 2.5 : 1.8} />
                                                                </View>
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </WebSocketProvider>
                        </ErrorBoundary>
                    </LazorKitProvider>
                </MobileWalletProvider>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    tabBarContainer: {
        position: "absolute",
        bottom: 10,
        width: "90%",
        alignSelf: "center",
        height: 65,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: "rgba(188, 186, 253, 0.15)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden'
    },
    tabsWrapper: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 30,
        alignItems: "center",
        width: "100%",
        height: "100%"
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1
    },
    iconContainerProfile: {
        width: 44,
        height: 44,
        justifyContent: "center",
        alignItems: "center",
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderColor: "#a18ed5"
    }
});