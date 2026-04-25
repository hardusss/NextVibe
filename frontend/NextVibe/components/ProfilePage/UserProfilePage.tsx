import { useState, useCallback, useRef, useEffect } from "react";
import {
    View,
    SafeAreaView,
    Text,
    StatusBar,
    Modal,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Animated,
    Easing,
    Linking,
    useColorScheme
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import FastImage from 'react-native-fast-image';
import Hyperlink from "react-native-hyperlink";
import { LinearGradient } from "expo-linear-gradient";

// API & Utils
import formatNumber from "@/src/utils/formatNumber";
import getUserDetail from "@/src/api/user.detail";
import followUser from "@/src/api/follow";
import CreateChat from "@/src/api/create.chat";

// Components
import PostGallery from "./PostsMenu";
import CollectionsGallery from "./CollectionsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import RecommendedUsers from "./recommendateProfiles";
import VerifyBadge from "../VerifyBadge";
import { AvatarWithFrame } from "./AvatarWithFrame";

// Styles
import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";

type UserData = {
    user_id: number;
    username: string;
    about: string;
    avatar_url: string | null;
    post_count: number;
    cnft_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean;
    isOg: boolean;
    ogEdition: number | null;
    is_subscribed: boolean;
    invited_count: number; // Added field
};

const TABS = ["Posts", "cNFTs"] as const;
type Tab = typeof TABS[number];

const EmptyState = ({
    iconName,
    title,
    description,
    colorScheme
}: {
    iconName: keyof typeof MaterialIcons.glyphMap,
    title: string,
    description: string,
    colorScheme: "light" | "dark" | null | undefined
}) => {
    const isDark = colorScheme === 'dark';

    return (
        <View style={{
            marginTop: 20,
            padding: 30,
            borderRadius: 24,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
            marginHorizontal: 4
        }}>
            <View style={{
                backgroundColor: isDark ? 'rgba(88, 166, 255, 0.1)' : 'rgba(88, 166, 255, 0.15)',
                padding: 18,
                borderRadius: 40,
                marginBottom: 16
            }}>
                <MaterialIcons name={iconName} size={42} color="#58a6ff" />
            </View>
            <Text style={{
                fontSize: 20,
                fontWeight: "bold",
                color: isDark ? "#ffffff" : "#000000",
                marginBottom: 8,
                textAlign: 'center'
            }}>
                {title}
            </Text>
            <Text style={{
                fontSize: 15,
                color: isDark ? "#9ca3af" : "#6b7280",
                textAlign: "center",
                lineHeight: 22
            }}>
                {description}
            </Text>
        </View>
    );
};

const ButtonSubscribe = ({ isSubscribed, onPress, isDark }: { isSubscribed: boolean, onPress: () => void, isDark: boolean }) => (
    <TouchableOpacity
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        style={{
            backgroundColor: isSubscribed ? '#2d075eff' : '#6A00F4',
            padding: 10,
            borderRadius: 8,
            width: '100%',
            borderWidth: 1,
            borderColor: isSubscribed ? '#2d075eff' : '#6A00F4',
        }}
        onPress={onPress}
    >
        <Text style={{
            color: 'white',
            textAlign: 'center',
            fontWeight: 'bold'
        }}>
            {isSubscribed ? 'Unfollow' : 'Follow'}
        </Text>
    </TouchableOpacity>
);

const UserProfileView = () => {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [userData, setUserData] = useState<UserData>({
        user_id: 0,
        username: "",
        about: "",
        avatar_url: null,
        post_count: 0,
        cnft_count: 0,
        readers_count: 0,
        follows_count: 0,
        official: false,
        is_subscribed: false,
        isOg: false,
        ogEdition: null,
        invited_count: 0
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<Tab>("Posts");
    const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(["Posts"]));
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;

    const postsOpacity = useRef(new Animated.Value(1)).current;
    const postsTranslate = useRef(new Animated.Value(0)).current;
    const cnftsOpacity = useRef(new Animated.Value(0)).current;
    const cnftsTranslate = useRef(new Animated.Value(40)).current;
    const prevTabRef = useRef<Tab>("Posts");

    const animateTabSwitch = (to: Tab) => {
        const from = prevTabRef.current;
        if (from === to) return;
        prevTabRef.current = to;

        const goingRight = to === "cNFTs";
        const outOpacity = goingRight ? postsOpacity : cnftsOpacity;
        const outTranslate = goingRight ? postsTranslate : cnftsTranslate;
        const inOpacity = goingRight ? cnftsOpacity : postsOpacity;
        const inTranslate = goingRight ? cnftsTranslate : postsTranslate;

        inTranslate.setValue(goingRight ? 40 : -40);
        inOpacity.setValue(0);

        Animated.parallel([
            Animated.timing(outOpacity, { toValue: 0, duration: 160, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(outTranslate, { toValue: goingRight ? -40 : 40, duration: 160, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(inOpacity, { toValue: 1, duration: 220, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(inTranslate, { toValue: 0, duration: 220, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    };

    const handleTabPress = (tab: Tab) => {
        if (tab === activeTab) return;
        setMountedTabs(prev => new Set([...prev, tab]));
        animateTabSwitch(tab);
        setActiveTab(tab);
    };

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(+id, true);
            setUserData({
                user_id: data?.user_id || 0,
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${data.avatar}` : null,
                post_count: data?.post_count || 0,
                cnft_count: data?.cnft_count || 0,
                readers_count: data?.readers_count || 0,
                follows_count: data?.follows_count || 0,
                official: data?.official || false,
                isOg: data?.isOg === true,
                ogEdition: data?.edition ?? null,
                is_subscribed: data?.is_subscribed || false,
                invited_count: data?.invited_count || 0
            });
        } catch (error) {
            console.error("Failed to fetch user data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribe = async () => {
        followUser(+id);
        setUserData(prev => ({
            ...prev,
            is_subscribed: !prev.is_subscribed,
            readers_count: prev.is_subscribed ? prev.readers_count - 1 : prev.readers_count + 1
        }));
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchUserData();
        setRefreshKey(prev => prev + 1);
        setMountedTabs(new Set([activeTab]));
        setRefreshing(false);
    }, [activeTab]);

    useEffect(() => {
        if (visible) {
            setIsVisibleContainer(true);
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                speed: 10,
                bounciness: 8,
            }).start();
        } else {
            Animated.timing(scaleAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
            setTimeout(() => { setIsVisibleContainer(false) }, 200);
        };
    }, [visible]);

    useFocusEffect(
        useCallback(() => {
            fetchUserData();
            return () => {
                setUserData({
                    user_id: 0,
                    username: "",
                    about: "",
                    avatar_url: null,
                    post_count: 0,
                    cnft_count: 0,
                    readers_count: 0,
                    follows_count: 0,
                    official: false,
                    isOg: false,
                    ogEdition: 0,
                    is_subscribed: false,
                    invited_count: 0
                });
            }
        }, [id])
    );

    return (
        <SafeAreaView style={[profileStyle.container, { overflow: "hidden" }]}>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? '#0A0410' : '#f0f0f0'}
            />

            {loading ? (
                <ActivityIndicator size="large" color="#58a6ff" style={{ flex: 1, justifyContent: "center", alignItems: "center" }} />
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 20, overflow: "hidden" }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colorScheme === 'dark' ? "#fff" : "#000"}
                            colors={["#58a6ff"]}
                            progressBackgroundColor={colorScheme === 'dark' ? "#000" : "#fff"}
                        />
                    }
                >
                    <Modal transparent visible={isVisibleContainer} animationType="fade">
                        <TouchableOpacity
                            style={{
                                flex: 1,
                                justifyContent: "center",
                                alignItems: "center",
                                backgroundColor: "rgba(0, 0, 0, 0.75)",
                            }}
                            activeOpacity={1}
                            onPress={() => setVisible(false)}
                        >
                            <Animated.View style={[{
                                backgroundColor: "transparent",
                                justifyContent: "center",
                                alignItems: "center",
                                width: '100%',
                            }, { transform: [{ scale: scaleAnim }] }]}>

                                <FastImage
                                    style={{
                                        width: 320,
                                        height: 320,
                                        borderRadius: 160
                                    }}
                                    source={{ uri: userData.avatar_url as string }}
                                    resizeMode={FastImage.resizeMode.cover}
                                />

                            </Animated.View>
                        </TouchableOpacity>
                    </Modal>

                    {/* Header */}
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 10 }}
                            onPress={() => router.back()}
                        >
                            <MaterialIcons name="arrow-back" size={32} color={colorScheme === 'dark' ? '#fff' : '#000'} />
                        </TouchableOpacity>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text style={profileStyle.username}>{userData.username}</Text>
                            {userData.official ? (
                                <VerifyBadge isLooped={true} isVisible={true} haveModal={true} isStatic={false} size={24} />
                            ) : null}
                        </View>
                    </View>

                    {/* Profile Stats */}
                    <View style={{ flexDirection: "row", marginTop: 20, marginLeft: 0 }}>
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => setVisible(true)}>

                            <View style={{ marginLeft: 16, marginTop: 5 }}>
                                <AvatarWithFrame
                                    avatarUrl={userData.avatar_url}
                                    size={74}
                                    invitedCount={userData.invited_count}
                                    isOg={userData.isOg}
                                    ogEdition={userData.ogEdition}
                                />
                            </View>

                        </TouchableOpacity>
                        <View style={{ flexDirection: "row", marginTop: 35, marginLeft: 20, flex: 1, justifyContent: "space-around" }}>
                            <View>
                                <Text style={[profileStyle.text, { fontWeight: "bold" }]}>{formatNumber(userData.post_count)}</Text>
                                <Text style={profileStyle.text}>Posts</Text>
                            </View>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: { userId: id, username: userData.username, activeTab: "Readers" } })}>
                                <View>
                                    <Text style={[profileStyle.text, { fontWeight: "bold" }]}>{formatNumber(userData.readers_count)}</Text>
                                    <Text style={profileStyle.text}>Readers</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: { userId: id, username: userData.username, activeTab: "Follows" } })}>
                                <View>
                                    <Text style={[profileStyle.text, { fontWeight: "bold" }]}>{formatNumber(userData.follows_count)}</Text>
                                    <Text style={profileStyle.text}>Follows</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* About */}
                    {userData.about ? (
                        <Hyperlink
                            linkStyle={{ color: "#A78BFA", fontWeight: "500" }}
                            onPress={(url: string) => Linking.openURL(url)}
                        >
                            <Text style={profileStyle.about}>{userData.about}</Text>
                        </Hyperlink>
                    ) : null}

                    {/* Subscribe Button */}
                    <View style={{ flexDirection: "row", marginTop: 20, justifyContent: "space-between" }}>
                        <ButtonSubscribe
                            isSubscribed={userData.is_subscribed}
                            onPress={handleSubscribe}
                            isDark={colorScheme === 'dark'}
                        />
                    </View>

                    <RecommendedUsers key={`recommended-${refreshKey}`} />

                    {/* Tabs Navigation */}
                    <View style={{
                        flexDirection: "row",
                        marginTop: 10,
                        marginBottom: 20,
                        borderRadius: 16,
                        backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                        padding: 4,
                    }}>
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab;
                            const tabLabel = tab === "cNFTs" ? `cNFTs (${userData.cnft_count})` : tab;

                            return (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => handleTabPress(tab)}
                                    style={{ flex: 1, borderRadius: 13, overflow: "hidden" }}
                                    activeOpacity={0.8}
                                >
                                    {isActive ? (
                                        <LinearGradient
                                            colors={["rgba(167,139,250,0.25)", "rgba(139,92,246,0.15)"]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={{
                                                paddingVertical: 10,
                                                alignItems: "center",
                                                borderRadius: 13,
                                                borderWidth: 1,
                                                borderColor: "rgba(167,139,250,0.3)",
                                            }}
                                        >
                                            <Text style={{
                                                color: "#a78bfa",
                                                fontSize: 13,
                                                fontFamily: "Dank Mono Bold",
                                                includeFontPadding: false,
                                            }}>
                                                {tabLabel}
                                            </Text>
                                        </LinearGradient>
                                    ) : (
                                        <View style={{ paddingVertical: 10, alignItems: "center", borderRadius: 13 }}>
                                            <Text style={{
                                                color: colorScheme === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
                                                fontSize: 13,
                                                fontFamily: "Dank Mono",
                                                includeFontPadding: false,
                                            }}>
                                                {tabLabel}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Tabs Content */}
                    <View style={{ overflow: "hidden" }}>

                        {/* Posts Tab */}
                        <Animated.View style={{
                            display: activeTab === "Posts" ? "flex" : "none",
                            opacity: postsOpacity,
                            transform: [{ translateX: postsTranslate }],
                        }}>
                            {mountedTabs.has("Posts") && (
                                userData.post_count === 0 ? (
                                    <EmptyState
                                        iconName="photo-camera"
                                        title="No Posts Yet"
                                        description="This user hasn't shared any moments yet."
                                        colorScheme={colorScheme}
                                    />
                                ) : (
                                    <PostGallery key={`posts-${refreshKey}`} id={+id} previous={"user-profile"} />
                                )
                            )}
                        </Animated.View>

                        {/* cNFTs Tab */}
                        <Animated.View style={{
                            display: activeTab === "cNFTs" ? "flex" : "none",
                            opacity: cnftsOpacity,
                            transform: [{ translateX: cnftsTranslate }],
                        }}>
                            {mountedTabs.has("cNFTs") && (
                                userData.cnft_count === 0 ? (
                                    <EmptyState
                                        iconName="collections"
                                        title="No cNFTs Yet"
                                        description="This user hasn't collected or created any cNFTs yet."
                                        colorScheme={colorScheme}
                                    />
                                ) : (
                                    <CollectionsGallery key={`collections-${refreshKey}`} id={+id} isOwnProfile={false} />
                                )
                            )}
                        </Animated.View>

                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default UserProfileView;