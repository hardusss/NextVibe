import { useState, useCallback, useEffect, useRef } from "react";
import {
    View,
    SafeAreaView,
    Text,
    StatusBar,
    Modal,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Animated,
    Easing,
    Linking,
    useColorScheme
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { AvatarWithFrame } from "./AvatarWithFrame";
import Hyperlink from 'react-native-hyperlink';
import { LinearGradient } from "expo-linear-gradient";
import FastImage from "react-native-fast-image";
import getUserDetail from "@/src/api/user.detail";
import { storage } from '@/src/utils/storage';
import formatNumber from "@/src/utils/formatNumber";

import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtonWallet";
import PostGallery from "./PostsMenu";
import CollectionsGallery from "./CollectionsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import VerifyBadge from "../VerifyBadge";

import { ShareViaNFC } from "./ShareViaNFC/ButtonShare";
import ShareModal, { ShareModalRef } from './ShareViaNFC/ShareBottomModal';

import { InviteSecondaryButton } from "./Invite/InviteButton";
import { InviteBottomSheet, InviteSheetRef } from "./Invite/InviteBottomSheet";

import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";

type UserData = {
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

const ProfileView = () => {
    const [userData, setUserData] = useState<UserData>({
        username: "",
        about: "",
        avatar_url: null,
        post_count: 0,
        cnft_count: 0,
        readers_count: 0,
        follows_count: 0,
        official: false,
        isOg: false,
        ogEdition: null,
    });

    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeTab, setActiveTab] = useState<Tab>("Posts");
    const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(["Posts"]));

    const [invitedCount, setInvitedCount] = useState<number>(0);

    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const [showVerifiedToast, setShowVerifiedToast] = useState(false);
    const [id, setId] = useState<number>();

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const hasFetched = useRef(false);

    const modalRef = useRef<ShareModalRef>(null);
    const inviteSheetRef = useRef<InviteSheetRef>(null);

    const postsOpacity = useRef(new Animated.Value(1)).current;
    const postsTranslate = useRef(new Animated.Value(0)).current;
    const cnftsOpacity = useRef(new Animated.Value(0)).current;
    const cnftsTranslate = useRef(new Animated.Value(40)).current;
    const prevTabRef = useRef<Tab>("Posts");

    const colorScheme = useColorScheme();
    const profileStyle = colorScheme === "dark" ? profileDarkStyles : profileLightStyles;
    const router = useRouter();

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

    useEffect(() => {
        if (showVerifiedToast) {
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 4,
                tension: 150,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(scaleAnim, {
                toValue: 0,
                duration: 400,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();
        }
    }, [showVerifiedToast]);

    const fetchUserData = async () => {
        try {
            const data = await getUserDetail(0);

            setUserData({
                username: data?.username || "",
                about: data?.about || "",
                avatar_url: data?.avatar ? `${data.avatar}` : null,
                post_count: data?.post_count || 0,
                cnft_count: data?.cnft_count || 0,
                readers_count: data?.readers_count || 0,
                follows_count: data?.follows_count || 0,
                official: data?.official === true,
                isOg: data?.isOg === true,
                ogEdition: data?.edition ?? null,
            });

            setInvitedCount(data?.invited_count || 0);
        } catch (error) {
            console.error("Fetch error reboot page", error);
        } finally {
            setLoading(false);
        }
    };

    const getId = async () => {
        const storedId = await storage.getItem("id");
        setId(parseInt(storedId as string));
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setRefreshKey(prev => prev + 1);
        setMountedTabs(new Set([activeTab]));
        hasFetched.current = false;
        await fetchUserData();
        setRefreshing(false);
    }, [activeTab]);

    const handleOpenModal = () => {
        modalRef.current?.present();
    };

    useEffect(() => {
        getId();
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!hasFetched.current) {
                fetchUserData();
                hasFetched.current = true;
            }
        }, [])
    );

    return (
        <SafeAreaView style={profileStyle.container}>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? '#0A0410' : '#ffffff'}
            />
            {loading ? (
                <ActivityIndicator size="large" color="#58a6ff" style={{ flex: 1, justifyContent: "center", alignItems: "center" }} />
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 20 }}
                    keyboardShouldPersistTaps="handled"
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

                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text style={profileStyle.username}>{userData.username}</Text>
                            {userData.official && (
                                <VerifyBadge isLooped={true} isVisible={true} haveModal={true} isStatic={false} size={24} />
                            )}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <ButtonWallet />
                            <ButtonSettings />
                        </View>
                    </View>

                    <View style={{ flexDirection: "row", marginTop: 20, marginLeft: 0 }}>
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => setVisible(true)}>
                            <View style={{ marginLeft: 16, marginTop: 5 }}>
                                <AvatarWithFrame
                                    avatarUrl={userData.avatar_url}
                                    size={74}
                                    invitedCount={invitedCount}
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
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Readers" } })}>
                                <View>
                                    <Text style={[profileStyle.text, { fontWeight: "bold" }]}>{formatNumber(userData.readers_count)}</Text>
                                    <Text style={profileStyle.text}>Readers</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Follows" } })}>
                                <View>
                                    <Text style={[profileStyle.text, { fontWeight: "bold" }]}>{formatNumber(userData.follows_count)}</Text>
                                    <Text style={profileStyle.text}>Follows</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View>
                        {userData.about !== "" && (
                            <Hyperlink
                                linkStyle={{ color: "#A78BFA", fontWeight: "500" }}
                                onPress={(url: string) => Linking.openURL(url)}
                            >
                                <Text style={profileStyle.about}>{userData.about}</Text>
                            </Hyperlink>
                        )}
                    </View>

                    <View style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        marginVertical: 16
                    }}>
                        <View style={{ flex: 1.6 }}>
                            <ShareViaNFC handlePress={handleOpenModal} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <InviteSecondaryButton handlePress={() => inviteSheetRef.current?.present()} />
                        </View>
                    </View>

                    <ShareModal ref={modalRef} avatarUrl={userData.avatar_url} profileUrl={`https://nextvibe.io/u/${id}`} />
                    <InviteBottomSheet ref={inviteSheetRef} />

                    <View style={{
                        marginBottom: 20,
                        flexDirection: "row",
                        borderRadius: 16,
                        backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                        padding: 4,
                    }}>
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab;
                            const tabLabel = tab === "Posts" ? `Posts (${userData.post_count})` : `cNFTs (${userData.cnft_count})`;

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

                    <View style={{ overflow: "hidden" }}>
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
                                        description="Start sharing your moments to make your profile more engaging."
                                        colorScheme={colorScheme}
                                    />
                                ) : (
                                    <PostGallery key={`posts-${refreshKey}`} id={id as number} previous="profile" />
                                )
                            )}
                        </Animated.View>

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
                                        description="Your collected and created cNFTs will appear here."
                                        colorScheme={colorScheme}
                                    />
                                ) : (
                                    <CollectionsGallery key={`collections-${refreshKey}`} id={id as number} />
                                )
                            )}
                        </Animated.View>
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default ProfileView;