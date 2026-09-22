import { Stack, usePathname, useSegments } from "expo-router";
import { useColorScheme, View, TouchableOpacity, StyleSheet, Linking, Text, Platform } from "react-native";
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
import * as NavigationBar from 'expo-navigation-bar';
import { syncPushToken } from "@/src/notifications/pushToken";
import { usePushTokenSync } from "@/hooks/usePushTokenSync";
import MapboxGL from '@rnmapbox/maps';
import { vexo, identifyDevice } from 'vexo-analytics';
import { track } from '@/src/utils/analytics';
import { StatusBar } from "expo-status-bar";
import { setupAxiosInterceptor } from "@/src/utils/axiosInterceptor";
import { useBleScanner } from "@/hooks/useBleScanner";
import ProximityPrompt from "@/components/Proximity/ProximityPrompt";
import { clearProfileCache } from "@/components/ProfilePage/ProfilePage";
import WebSocketService from "@/src/services/WebSocketService";
import { useSettingsStore } from "@/src/stores/settingsStore";
import { completeColdStartHandshake } from "@/src/services/walletDeepLink";
import { markSeekerIntroPending } from "@/src/stores/seekerIntroStore";
import { intentFromNotification, intentFromUrl, isBootstrapPath } from "@/src/navigation/intents";
import { hydratePendingIntent, setPendingIntent } from "@/src/navigation/pendingIntent";
import { subscribeIntentLinks } from "@/src/navigation/intentQueue";
import { useAppReadyStore } from "@/src/navigation/appReadyStore";
import { useIntentConsumer, useRouterMountedSignal } from "@/src/navigation/useIntentConsumer";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

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

/** Notification ids already handled in this JS context (cold start delivers one tap twice). */
const handledNotificationIds = new Set<string>();

// Read the intent persisted before an OTA reload / crash as early as possible.
hydratePendingIntent();

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
    "camera", "u/e", "u/[id]", "u/post/[id]", "blocked-accounts", "u/verified/[username]"
];

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        'Dank Mono': require('@/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
        'Dank Mono Bold': require('@/assets/fonts/PlusJakartaSans-Bold.ttf'),
    });

    const theme = useColorScheme();
    const isSettingsHydrated = useSettingsStore((state) => state.isHydrated);
    const loadSettings = useSettingsStore((state) => state.loadSettings);
    const segments = useSegments();
    const pathname = usePathname();
    const authVersion = useAppReadyStore((state) => state.authVersion);
    const shellRendered = !((!fontsLoaded && !fontError) || !isSettingsHydrated);
    const cachedAvatarRef = useRef<{ userId: number; url: string } | null>(null);
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const [userID, setUserID] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [visible, setVisible] = useState<boolean>(false);

    // App-wide nearby detection for taps, only while signed in.
    useBleScanner(userID !== null);
    // Push token: every launch and every sign-in, including wallet-only accounts.
    usePushTokenSync(userID);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (fontsLoaded || fontError) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded, fontError]);

    useEffect(() => {
        if (Platform.OS === 'ios') {
            SystemUI.setBackgroundColorAsync(theme === "dark" ? "#0A0410" : "#ffffff");
        } else {
            // Edge-to-edge: keep the gesture/nav bar transparent with
            // buttons matching the theme.
            NavigationBar.setButtonStyleAsync(theme === "dark" ? "light" : "dark").catch(() => {});
        }
    }, [theme]);

    function handleRegistrationError(errorMessage: string) {
        setToastMessage(errorMessage);
        setVisible(true);
    }

    // The app's only notification prompt, on launch. The token itself is
    // registered by usePushTokenSync once someone is signed in.
    async function requestPushPermission() {
        if (!Device.isDevice) {
            handleRegistrationError('Must use physical device for push notifications');
            return;
        }

        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#7C3AED',
            });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus === 'granted') return;

        const { status } = await Notifications.requestPermissionsAsync();
        // Allowed just now while signed in: don't wait for the next launch.
        if (status === 'granted') syncPushToken('permission');
    }

    // Push taps and deep links never navigate here: they only record an intent.
    // useIntentConsumer (below) navigates once the router, the start flow (OTA
    // check + auth) and the profile are ready.
    const handleNotificationResponse = (response: Notifications.NotificationResponse | null, via: string) => {
        if (!response) return;
        const request = response.notification.request;
        const data = (request.content.data ?? {}) as Record<string, any>;
        const notificationId = request.identifier;
        if (handledNotificationIds.has(notificationId)) return;
        handledNotificationIds.add(notificationId);

        const { intent, external } = intentFromNotification(data, notificationId, Date.now());
        walletLogger.info(WalletTag.NAV_INTENT, `Notification tap (${via})`, { notificationId, type: data?.type, hasIntent: !!intent, external: !!external });

        if (external) {
            Linking.openURL(external).catch(() => { });
        }
        const accepted = intent ? setPendingIntent(intent) : false;

        // Pushes sent from `manage.py nv` carry the campaign they belong to;
        // a tap is the only "open" signal we have, so report it to Vexo.
        if ((accepted || external) && typeof data?.campaign === 'string' && data.campaign) {
            track('campaign_open', {
                campaign: data.campaign,
                variant: typeof data.variant === 'string' ? data.variant : 'A',
                wave: Number(data.wave) || 1,
            });
        }
    };

    const handleIncomingUrl = (url: string | null, initial: boolean, via: string) => {
        if (!url) return;
        const intent = intentFromUrl(url, initial, Date.now());
        if (!intent) return;
        walletLogger.info(WalletTag.NAV_INTENT, `Deep link (${via})`, { url, initial });
        setPendingIntent(intent);
    };

    // Background / foreground tap.
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            handleNotificationResponse(response, 'listener');
        });
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        // Badge granted while the app is open: the profile refetches and opens
        // the Seeker sheet once, even if the banner itself is never tapped
        const subscription = Notifications.addNotificationReceivedListener((notification) => {
            if (notification.request.content.data?.type === 'seeker_verified') {
                clearProfileCache();
                markSeekerIntroPending();
            }
        });

        return () => subscription.remove();
    }, []);

    // Cold start: the tap that launched the app.
    useEffect(() => {
        Notifications.getLastNotificationResponseAsync()
            .then((response) => handleNotificationResponse(response, 'last-response'))
            .catch(() => { });
    }, []);

    // Deep links: +native-intent.ts queues own-profile links; Linking covers
    // the launch URL and warm links too (the store drops duplicates).
    useEffect(() => subscribeIntentLinks((link) => {
        handleIncomingUrl(link.url, link.initial, 'native-intent');
    }), []);

    useEffect(() => {
        Linking.getInitialURL()
            .then((url) => handleIncomingUrl(url, true, 'initial-url'))
            .catch(() => { });
        const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url, false, 'url-event'));
        return () => subscription.remove();
    }, []);

    // Boot signals for useAppReady().
    useRouterMountedSignal(shellRendered);

    useEffect(() => {
        // A deep link that opened a real screen directly (username link, post
        // link…) skipped Splash, so there's no start flow to wait for.
        if (pathname && pathname !== '/' && !isBootstrapPath(pathname)) {
            useAppReadyStore.getState().markBootstrapDone();
        }
    }, [pathname]);

    useIntentConsumer({
        beforeNavigate: (intent) => {
            // The profile must refetch seeker_verified before it can open the sheet.
            if (intent.kind === 'seeker_verified') clearProfileCache();
        },
        afterNavigate: (intent) => {
            if (intent.source === 'push') {
                // Don't hand the same tap back after a JS reload.
                try { Notifications.clearLastNotificationResponse(); } catch { }
            }
        },
    });

    useEffect(() => {
        requestPushPermission();
    }, []);

    useEffect(() => {
        // A wallet deep-link redirect may have cold-started the app while no
        // wallet screen was mounted — finish that handshake here (no-op on
        // Android and on ordinary launches).
        completeColdStartHandshake();
    }, []);

    useEffect(() => {
        const unsubscribeWS = WebSocketService.addListener(async (event: any) => {
            if (!event) return;

            if (event.type === 'reaction_update' && Array.isArray(event.reactions)) {
                const otherReaction = event.reactions.find((r: any) => r.reacted_by_me === false);

                if (otherReaction) {
                    const emoji = otherReaction.emoji || '❤️';
                    Notifications.scheduleNotificationAsync({
                        content: {
                            title: 'New Reaction',
                            body: `Someone reacted ${emoji} to your message`,
                            data: { url: `/(shared)/chat-room?id=${event.chat_id}` },
                        },
                        trigger: null,
                    });
                }
            }
        });

        return () => {
            unsubscribeWS();
        };
    }, []);

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (res) => res,
            (error) => {
                // The IRL daily tap limit is a 429 too, but the tap sheet explains it.
                if (error.response?.status === 429 && error.response?.data?.code !== 'IRL_DAILY_LIMIT') {
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
                useAppReadyStore.getState().setAuthStatus(id ? 'in' : 'out');
            } catch (e) { }
        };
        loadUser();
    }, [segments, authVersion]);

    useEffect(() => {
        if (!userID) {
            useAppReadyStore.getState().setProfileLoaded(false);
            setImageProfile(null);
            cachedAvatarRef.current = null;
            Image.clearMemoryCache();
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
                // First profile load: a pending push/link intent may navigate now.
                useAppReadyStore.getState().setProfileLoaded(true);

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

    if (!shellRendered) return null;

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
                                <ProximityPrompt />
                            </WebSocketProvider>
                        </ErrorBoundary>
                    </LazorKitProvider>
                </MobileWalletProviderGate>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}
