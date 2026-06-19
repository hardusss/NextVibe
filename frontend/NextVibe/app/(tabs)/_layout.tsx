import { RelativePathString, Stack, useRouter, useSegments } from "expo-router";
import { useColorScheme, View, TouchableOpacity, StyleSheet, Linking } from "react-native";
import React, { useEffect, useState, useRef } from "react";
import getUserDetail from "@/src/api/user.detail";
import FastImage from 'react-native-fast-image';
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
import { House, Search, BadgePlus, UserRound, Radar } from "lucide-react-native";
import { BlurView } from "@react-native-community/blur";
import PromoBanner from "@/components/Shared/PromoBanner";
import { scrollFeedToTop } from "@/src/utils/feedScrollRef";
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import savePushToken from "@/src/api/save.push.token";
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapboxGL from '@rnmapbox/maps';
import { vexo, identifyDevice } from 'vexo-analytics';
import * as Haptics from 'expo-haptics';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { MOTION } from '@/constants/motion';

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
        // Only apply the default custom font when no fontFamily is explicitly set.
        // Icon fonts (MaterialIcons, Ionicons, lucide, etc.) set their own fontFamily
        // and must NOT be overridden — otherwise icons render as garbled text.
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
        return { internal: `/posts?id=${data.post_id}` };
    }
    if (data?.type === 'new_comment' && data?.post_id) {
        return { internal: `/posts?id=${data.post_id}` };
    }
    if (data?.type === 'new_message' && data?.chat_id && data?.user_id) {
        return { internal: `/chat-room?id=${data.chat_id}&userId=${data.user_id}` };
    }
    return {};
}

const blacklist = [
    "register", "login", "postslist",
    "splash", "index", "create-post",
    "settings", "select-token", "deposit",
    "transaction", "user-profile", "result-transaction",
    "transactions", "transaction-detail", "chat-room",
    "chats", "follows-screen", "notifications",
    "user-banned", "wallet-init", "wallet-dash",
    "wallet-select", "send", "swap", "event-checkin",
    "post-details", "all-tokens", "eas-update"
];

const stackScreens = blacklist.filter(item => item !== "send");

const tabRoots = new Set(["home", "search", "vibe-map", "camera", "profile"]);
const modalScreens = new Set([
    "swap", "deposit", "select-token", "transaction-detail",
    "result-transaction", "post-details", "event-checkin",
]);

const TAB_OPTIONS = { animation: "none" as const };
const MODAL_OPTIONS = { presentation: "modal" as const, animation: "slide_from_bottom" as const };
const STACK_OPTIONS = { animation: "slide_from_right" as const };

const getStackScreenOptions = (name: string) => {
    if (tabRoots.has(name)) return TAB_OPTIONS;
    if (modalScreens.has(name)) return MODAL_OPTIONS;
    return STACK_OPTIONS;
};

const GLOBAL_SCREEN_OPTIONS: any = {
    headerShown: false,
    animation: "slide_from_right",
    contentStyle: { backgroundColor: 'transparent' },
};

const APP_TABS = [
    { name: "home", IconOutline: House, IconFilled: House },
    { name: "search", IconOutline: Search, IconFilled: Search },
    { name: "vibe-map", IconOutline: Radar, IconFilled: Radar },
    { name: "camera", IconOutline: BadgePlus, IconFilled: BadgePlus },
    { name: "profile", IconOutline: UserRound, IconFilled: UserRound },
];

const TabButton = ({
    tab,
    isActive,
    theme,
    activeBgColor,
    iconColor,
    imageProfile,
    userID,
    onPress,
    styles,
}: {
    tab: typeof APP_TABS[number];
    isActive: boolean;
    theme: string | null | undefined;
    activeBgColor: string;
    iconColor: string;
    imageProfile: string | null;
    userID: number | null;
    onPress: () => void;
    styles: any;
}) => {
    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));
    const Icon = isActive ? tab.IconFilled : tab.IconOutline;

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => { scale.value = withSpring(MOTION.press.scale, MOTION.spring.snappy); }}
            onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Animated.View style={animStyle}>
                {tab.name === "profile" && userID ? (
                    <View style={styles.iconContainerProfile}>
                        <FastImage
                            source={{
                                uri: imageProfile || DEFAULT_AVATAR,
                                priority: FastImage.priority.high,
                            }}
                            style={[
                                styles.avatar,
                                {
                                    borderWidth: isActive ? 1 : 0,
                                    backgroundColor: theme === "dark" ? "#2a2a2a" : "#e0e0e0",
                                },
                            ]}
                        />
                    </View>
                ) : (
                    <View
                        style={[
                            styles.iconContainer,
                            {
                                backgroundColor: isActive ? activeBgColor : "transparent",
                                borderColor: isActive 
                                    ? (theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(124, 58, 237, 0.15)")
                                    : "transparent",
                            },
                        ]}
                    >
                        <Icon size={24} color={iconColor} strokeWidth={isActive ? 2.5 : 1.8} />
                    </View>
                )}
            </Animated.View>
        </Pressable>
    );
};

export default function Layout() {
    const [fontsLoaded, fontError] = useFonts({
        'Dank Mono': require('@/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
        'Dank Mono Bold': require('@/assets/fonts/PlusJakartaSans-Bold.ttf'),
    });

    const theme = useColorScheme();
    const router = useRouter();
    const segments = useSegments();
    const currentPage = segments[segments.length - 1];
    const cachedAvatarRef = useRef<{ userId: number; url: string } | null>(null);
    const pushRegisteredRef = useRef(false);
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const [userID, setUserID] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [visible, setVisible] = useState<boolean>(false);

    useEffect(() => {
        if (fontsLoaded || fontError) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded, fontError]);

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

    // Deep link handler
    const handleNotificationNavigation = (data: Record<string, any>) => {
        const { internal, external } = resolveNotificationUrl(data);

        if (external) {
            Linking.openURL(external).catch(() => { });
            return;
        }

        if (internal) {
            // Small delay to ensure router is ready
            setTimeout(() => {
                router.push(internal as RelativePathString);
            }, 300);
        }
    };

    // Handle tap on notification when app is foregrounded or backgrounded
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content.data ?? {};
            handleNotificationNavigation(data);
        });

        return () => subscription.remove();
    }, []);

    // Handle tap on notification when app was fully closed (cold start)
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
            FastImage.clearMemoryCache();
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
                    FastImage.preload([{ uri: newUrl, priority: FastImage.priority.high }]);
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

    const goToTab = (tab: string) => {
        Haptics.selectionAsync();
        if (currentPage === tab && tab === 'home') {
            scrollFeedToTop();
            return;
        }
        router.navigate(tab as RelativePathString);
    };
    const showTabBar = ![...blacklist, "camera"].includes(currentPage);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
                <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
                    <LazorKitProvider
                        rpcUrl={endpoint}
                        portalUrl="https://portal.lazor.sh"
                        configPaymaster={{ paymasterUrl: "https://kora.lazorkit.com" }}
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
                                <View style={{ flex: 1, backgroundColor: theme === "dark" ? "#000" : "#fff" }}>
                                    <Stack screenOptions={GLOBAL_SCREEN_OPTIONS}>
                                        <Stack.Screen name="home" options={getStackScreenOptions("home")} />
                                        <Stack.Screen name="search" options={getStackScreenOptions("search")} />
                                        <Stack.Screen name="vibe-map" options={getStackScreenOptions("vibe-map")} />
                                        <Stack.Screen name="camera" options={getStackScreenOptions("camera")} />
                                        <Stack.Screen name="profile" options={getStackScreenOptions("profile")} />
                                        {stackScreens.map((item) => (
                                            <Stack.Screen
                                                key={item}
                                                name={item}
                                                options={getStackScreenOptions(item)}
                                            />
                                        ))}
                                    </Stack>

                                    {showTabBar && (
                                        <View style={styles.tabBarContainer}>
                                            <BlurView
                                                blurType={theme === "dark" ? "dark" : "light"}
                                                blurAmount={10}
                                                style={StyleSheet.absoluteFill}
                                            />
                                            <View style={[
                                                StyleSheet.absoluteFill,
                                                { backgroundColor: theme === "dark" ? "rgba(20, 8, 41, 0.4)" : "rgba(255, 255, 255, 0.85)" }
                                            ]} />
                                            <View style={styles.tabsWrapper}>
                                                {APP_TABS.map((tab) => {
                                                    const isActive = currentPage === tab.name;
                                                    const activeBgColor = theme === "dark"
                                                        ? "rgba(154, 109, 191, 0.15)"
                                                        : "rgba(124, 58, 237, 0.08)";
                                                    const iconColor = isActive
                                                        ? (theme === "dark" ? "#FFFFFF" : "#7c3aed")
                                                        : (theme === "dark" ? "rgb(144, 141, 141)" : "#8A8296");

                                                    return (
                                                        <TabButton
                                                            key={tab.name}
                                                            tab={tab}
                                                            isActive={isActive}
                                                            theme={theme}
                                                            activeBgColor={activeBgColor}
                                                            iconColor={iconColor}
                                                            imageProfile={imageProfile}
                                                            userID={userID}
                                                            onPress={() => goToTab(tab.name)}
                                                            styles={styles}
                                                        />
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                    <PromoBanner />
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
        overflow: 'hidden',
    },
    tabsWrapper: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 30,
        alignItems: "center",
        width: "100%",
        height: "100%",
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
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
        borderColor: "#a18ed5",
    },
});