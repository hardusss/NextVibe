import { Tabs, useRouter, usePathname } from "expo-router";
import { House, Search, BadgePlus, UserRound, Radar } from "lucide-react-native";
import { useColorScheme, Image, View, StyleSheet, Pressable } from "react-native";
import { useEffect, useState } from "react";
import getUserDetail from "@/src/api/user.detail";
import { BlurView } from "expo-blur";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import * as Haptics from 'expo-haptics';

const DEFAULT_AVATAR = 'https://media.nextvibe.io/images/default.png';

const APP_TABS = [
    { name: "home", IconOutline: House, IconFilled: House },
    { name: "search", IconOutline: Search, IconFilled: Search },
    { name: "vibe-map", IconOutline: Radar, IconFilled: Radar },
    { name: "camera", IconOutline: BadgePlus, IconFilled: BadgePlus },
    { name: "profile", IconOutline: UserRound, IconFilled: UserRound },
];

const MOTION = {
    press: { scale: 0.92 },
    spring: {
        snappy: { damping: 15, stiffness: 150, mass: 1 },
    }
};

const TabButton = ({
    tab,
    isActive,
    isDark,
    activeBgColor,
    iconColor,
    imageProfile,
    onPress,
}: {
    tab: typeof APP_TABS[number];
    isActive: boolean;
    isDark: boolean;
    activeBgColor: string;
    iconColor: string;
    imageProfile: string | null;
    onPress: () => void;
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
                {tab.name === "profile" ? (
                    <View style={styles.iconContainerProfile}>
                        <Image
                            source={{ uri: imageProfile || DEFAULT_AVATAR }}
                            style={[
                                styles.avatar,
                                {
                                    borderWidth: isActive ? 1.5 : 0,
                                    borderColor: "#A855F7",
                                    backgroundColor: isDark ? "#2a2a2a" : "#e0e0e0",
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
                                    ? (isDark ? "rgba(255,255,255,0.2)" : "rgba(124, 58, 237, 0.15)")
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

export default function AndroidTabsLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
    const activeColor = isDark ? "#FFFFFF" : "#7c3aed";
    const [imageProfile, setImageProfile] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const getImageProfile = async () => {
            try {
                const data = await getUserDetail();
                if (data && data.avatar && isMounted) {
                    setImageProfile(data.avatar);
                }
            } catch (error) {
                console.error("Error get avatar", error);
            }
        };

        getImageProfile();
        return () => { isMounted = false; };
    }, [pathname]);

    return (
        <Tabs
            tabBar={({ state, navigation }) => {
                const activeRouteName = state.routes[state.index].name;

                const handlePress = (name: string) => {
                    Haptics.selectionAsync();
                    if (name === "camera") {
                        router.push("/camera");
                    } else {
                        navigation.navigate({ name, merge: true });
                    }
                };

                return (
                    <View style={styles.tabBarContainer}>
                        <BlurView
                            intensity={100}
                            tint={isDark ? "dark" : "light"}
                            experimentalBlurMethod="dimezisBlurView"
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDark ? "rgba(20, 8, 41, 0.4)" : "rgba(255, 255, 255, 0.85)" }
                        ]} />
                        <View style={styles.tabsWrapper}>
                            {APP_TABS.map((tab) => {
                                const isActive = activeRouteName === tab.name;
                                const activeBgColor = isDark
                                    ? "rgba(154, 109, 191, 0.15)"
                                    : "rgba(124, 58, 237, 0.08)";
                                const iconColor = isActive
                                    ? activeColor
                                    : (isDark ? "rgb(144, 141, 141)" : "#8A8296");

                                return (
                                    <TabButton
                                        key={tab.name}
                                        tab={tab}
                                        isActive={isActive}
                                        isDark={isDark}
                                        activeBgColor={activeBgColor}
                                        iconColor={iconColor}
                                        imageProfile={imageProfile}
                                        onPress={() => handlePress(tab.name)}
                                    />
                                );
                            })}
                        </View>
                    </View>
                );
            }}
            screenOptions={{
                headerShown: false,
            }}
        >
            <Tabs.Screen name="index" options={{ href: null }} />
            <Tabs.Screen name="home" options={{ title: "Home" }} />
            <Tabs.Screen name="search" options={{ title: "Search" }} />
            <Tabs.Screen name="vibe-map" options={{ title: "Map" }} />
            <Tabs.Screen name="camera" options={{ title: "Camera" }} />
            <Tabs.Screen name="profile" options={{ title: "Profile" }} />
            <Tabs.Screen name="u" options={{ href: null }} />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabBarContainer: {
        position: "absolute",
        bottom: 16,
        width: "90%",
        alignSelf: "center",
        height: 68,
        borderRadius: 34,
        borderWidth: 1,
        borderColor: "rgba(167, 139, 250, 0.15)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
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
    },
});



