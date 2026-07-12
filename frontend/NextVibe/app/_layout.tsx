import { RelativePathString, Stack, useRouter, useSegments } from "expo-router";
import { useColorScheme, View, TouchableOpacity, StyleSheet, Linking, Text, AppState, AppStateStatus, Platform } from "react-native";
import React, { useEffect, useState, useRef } from "react";
import getUserDetail from "@/src/api/user.detail";
import { Image } from 'expo-image';
import { storage } from "@/src/utils/storage";
import { WebSocketProvider } from "@/src/context/WebSocketContext";
import axios from "axios";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";
import ErrorBoundary from 'react-native-error-boundary';
import ErrorFallback from "@/components/ErrorFallback";
import { LazorKitProvider } from '@lazorkit/wallet-mobile-adapter';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import PromoBanner from "@/components/Shared/PromoBanner";
import MobileWalletProviderGate from "@/components/Providers/MobileWalletProviderGate";
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import Constants from 'expo-constants';
import savePushToken from "@/src/api/save.push.token";
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapboxGL from '@rnmapbox/maps';
import { vexo, identifyDevice } from 'vexo-analytics';
import { StatusBar } from "expo-status-bar";
import { setupAxiosInterceptor } from "@/src/utils/axiosInterceptor";
import { useBleScanner } from "@/hooks/useBleScanner";

setupAxiosInterceptor();

const chain = 'solana:mainnet';

const endpoint = 'https://api.nextvibe.io/api/v1/wallets/rpc/';
const identity = {
    name: 'NextVibe',
    uri: 'https://nextvibe.io',
    icon: 'logo.png',
};

if (!__DEV__ && process.env.EXPO_PUBLIC_VEXO_API_KEY) {
    vexo(process.env.EXPO_PUBLIC_VEXO_API_KEY);
}

SplashScreen.preventAutoHideAsync();

if (process.env.EXPO_PUBLIC_MAPBOX_TOKEN) {
    MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
} else {
    console.warn("Mapbox token is missing in .env!");
}

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

const defaultFontFamily = 'Dank Mono';
const boldFontFamily = 'Dank Mono Bold';

if (StyleSheet.setStyleAttributePreprocessor) {
    StyleSheet.setStyleAttributePreprocessor('fontFamily', (fontFamily) => {
        if (!fontFamily) return defaultFontFamily;
        return fontFamily;
    });
}

const DEFAULT_AVATAR = 'https://media.nextvibe.io/images/default.png';
const PUSH_TOKEN_KEY = 'expo_push_token';

function resolveNotificationUrl(data: Record<string, any>): { internal?: string; external?: string } {
    if (data?.external_url) return { external: data.external_url };
    if (data?.url) return { internal: data.url };

    if (data?.type === 'new_follower' && data?.user_id) {
        return { internal: `/user-profile?id=${data.user_id}` };
    }
    if (data?.type === 'new_like' && data?.post_id) {
        return { internal: `/post-details?id=${data.post_id}` };
    }
    if (data?.type === 'new_comment' && data?.post_id) {
        return { internal: `/post-details?id=${data.post_id}` };
    }
    if (data?.type === 'new_message' && data?.chat_id && data?.user_id) {
        return { internal: `/chat-room?id=${data.chat_id}&userId=${data.user_id}` };
    }
    return {};
}

const MODAL_SCREENS = new Set([
    "swap", "deposit", "transaction-detail",
    "result-transaction", "post-details", "event-checkin",
]);

const FULLSCREEN_SCREENS = new Set(["camera", "create-post", "select-token", "transaction"]);

function screenOptionsFor(name: string) {
    if (FULLSCREEN_SCREENS.has(name)) {
        return { presentation: "fullScreenModal" as const, animation: "slide_from_bottom" as const };
    }
    if (MODAL_SCREENS.has(name)) {
        return { presentation: "modal" as const, animation: "slide_from_bottom" as const };
    }
    return { animation: "slide_from_right" as const };
}

const SHARED_SCREENS = [
    "register", "login", "postslist", "splash", "create-post",
    "settings", "select-token", "deposit", "transaction", "user-profile",
    "result-transaction", "transactions", "transaction-detail", "chat-room",
    "chats", "follows-screen", "notifications", "user-banned", "wallet-init",
    "wallet-dash", "wallet-select", "swap", "event-checkin", "post-details",
    "all-tokens", "eas-update", "events", "event-nfc-share", "event-nfc-receive",
    "camera", "u/[id]", "u/post/[id]"
];

export default function RootLayout() {
    // Enable background-style foreground BLE scanning on iOS
    useBleScanner();

    const [fontsLoaded, fontError] = useFonts({
        'Dank Mono': require('@/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
        'Dank Mono Bold': require('@/assets/fonts/PlusJakartaSans-Bold.ttf'),
    });

    const theme = useColorScheme();
    const router = useRouter();
    const segments = useSegments();
    const pushRegisteredRef = useRef(false);
    const cachedAvatarRef = useRef<{ userId: number; url: string } | null>(null);
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const [userID, setUserID] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [visible, setVisible] = useState<boolean>(false);

    useEffect(() => {
        if (fontsLoaded || fontError) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded, fontError]);

    useEffect(() => {
        if (Platform.OS === 'ios') {
            SystemUI.setBackgroundColorAsync(theme === "dark" ? "#0A0410" : "#ffffff");
        }
    }, [theme]);

    function handleRegistrationError(errorMessage: string) {
        setToastMessage(errorMessage);
        setVisible(true);
    }

    async function registerForPushNotifications() {
        if (pushRegisteredRef.current) return;

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

        if (finalStatus !== 'granted') return;

        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

        if (!projectId) {
            handleRegistrationError('Project ID not found');
            return;
        }

        try {
            const pushTokenString = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            const savedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);

            if (savedToken !== pushTokenString) {
                await savePushToken(pushTokenString);
                await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushTokenString);
            }

            pushRegisteredRef.current = true;
            return pushTokenString;
        } catch (e: unknown) {
            handleRegistrationError(`${e}`);
        }
    }

    const handleNotificationNavigation = (data: Record<string, any>) => {
        const { internal, external } = resolveNotificationUrl(data);

        if (external) {
            Linking.openURL(external).catch(() => { });
            return;
        }

        if (internal) {
            setTimeout(() => {
                router.push(internal as RelativePathString);
            }, 300);
        }
    };

    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content.data ?? {};
            handleNotificationNavigation(data);
        });

        return () => subscription.remove();
    }, []);

    useEffect(() => {
        Notifications.getLastNotificationResponseAsync().then((response) => {
            if (!response) return;
            const data = response.notification.request.content.data ?? {};
            handleNotificationNavigation(data);
        });
    }, []);

    useEffect(() => {
        if (segments[1] === "profile" && userID) {
            registerForPushNotifications();
        }
    }, [segments, userID]);

    useEffect(() => {
        let pushTokenSubscription: any = null;

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                if (!pushTokenSubscription) {
                    try {
                        pushTokenSubscription = Notifications.addPushTokenListener((token) => {
                            if (token && token.data) {
                                savePushToken(token.data).catch(() => { });
                            }
                        });
                    } catch (e) {
                        console.warn("Failed to register push token listener:", e);
                    }
                }
            } else {
                if (pushTokenSubscription) {
                    pushTokenSubscription.remove();
                    pushTokenSubscription = null;
                }
            }
        };

        const appStateSub = AppState.addEventListener('change', handleAppStateChange);

        if (AppState.currentState === 'active') {
            try {
                pushTokenSubscription = Notifications.addPushTokenListener((token) => {
                    if (token && token.data) {
                        savePushToken(token.data).catch(() => { });
                    }
                });
            } catch (e) {
                console.warn("Failed to register push token listener on mount:", e);
            }
        }

        return () => {
            if (pushTokenSubscription) {
                pushTokenSubscription.remove();
            }
            appStateSub.remove();
        };
    }, []);

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
        const loadUser = async () => {
            try {
                const id = await storage.getItem('id');
                if (id) setUserID(Number(id));
                else setUserID(null);
            } catch (e) { }
        };
        loadUser();
    }, [segments]);

    useEffect(() => {
        if (!userID) {
            setImageProfile(null);
            cachedAvatarRef.current = null;
            pushRegisteredRef.current = false;
            Image.clearMemoryCache();
            AsyncStorage.removeItem(PUSH_TOKEN_KEY);
        }
    }, [userID]);

    useEffect(() => {
        if (!userID) return;

        let isMounted = true;

        const fetchAvatar = async () => {
            try {
                if (!imageProfile) {
                    setImageProfile(DEFAULT_AVATAR);
                }

                const userData = await getUserDetail();

                if (!__DEV__ && isMounted) {
                    identifyDevice(userData.username || String(userID));
                }

                const newUrl = userData.avatar || DEFAULT_AVATAR;
                const cached = cachedAvatarRef.current;

                if (isMounted && (cached?.userId !== userID || cached?.url !== newUrl)) {
                    Image.prefetch([newUrl]);
                    cachedAvatarRef.current = { userId: userID, url: newUrl };
                    setImageProfile(newUrl);
                }
            } catch (e) {
                if (isMounted && !imageProfile) {
                    setImageProfile(DEFAULT_AVATAR);
                }
            }
        };

        fetchAvatar();
        return () => { isMounted = false; };
    }, [userID]);

    if (!fontsLoaded && !fontError) return null;

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme === "dark" ? "#0A0410" : "#ffffff" }}>
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
            <BottomSheetModalProvider>
                <MobileWalletProviderGate chain={chain} endpoint={endpoint} identity={identity}>
                    <LazorKitProvider
                        rpcUrl={endpoint}
                        portalUrl="https://portal.lazor.sh"
                        configPaymaster={{
                            paymasterUrl: process.env.EXPO_PUBLIC_PAYMASTER_URL || "https://paymaster.lazor.sh",
                            apiKey: process.env.EXPO_PUBLIC_PAYMASTER_API_KEY
                        }}
                        isDebug={__DEV__}
                    >
                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                            <WebSocketProvider userId={userID || 0}>
                                {toastMessage && (
                                    <Web3Toast
                                        message={toastMessage}
                                        visible={visible}
                                        onHide={() => setVisible(false)}
                                        isSuccess={false}
                                    />
                                )}
                                <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
                                    <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                                    {SHARED_SCREENS.map((name) => (
                                        <Stack.Screen key={name} name={`(shared)/${name}`} options={screenOptionsFor(name)} />
                                    ))}
                                </Stack>
                                <PromoBanner />
                            </WebSocketProvider>
                        </ErrorBoundary>
                    </LazorKitProvider>
                </MobileWalletProviderGate>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}
