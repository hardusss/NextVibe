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
    useColorScheme,
    StyleSheet,
    Dimensions,
    InteractionManager,
    Platform,
} from "react-native";
import { useFocusEffect, useRouter } from 'expo-router';
import { AvatarWithFrame } from "./AvatarWithFrame";
import Hyperlink from 'react-native-hyperlink';
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Star, Camera, Layers, Calendar } from "lucide-react-native";
import AnimatedReanimated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSpring,
} from 'react-native-reanimated';
import { FadeIn } from '@/components/Shared/motion';
import getUserDetail from "@/src/api/user.detail";
import { storage } from '@/src/utils/storage';
import formatNumber from "@/src/utils/formatNumber";

import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtonWallet";
import PostGallery, { clearPostsCache } from "./PostsMenu";
import CollectionsGallery, { clearCollectionsCache } from "./CollectionsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import VerifyBadge from "../VerifyBadge";

import { ShareViaNFC } from "./ShareViaNFC/ButtonShare";
import ShareModal, { ShareModalRef } from './ShareViaNFC/ShareBottomModal';

import { InviteSecondaryButton } from "./Invite/InviteButton";
import { InviteBottomSheet, InviteSheetRef } from "./Invite/InviteBottomSheet";

import { EventConnectionsSheet, EventConnectionsSheetRef } from "./EventConnectionsSheet";

import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_HEIGHT = 200;

// ── Module-level cache to survive tab-switch remounts ──
let cachedUserData: UserData | null = null;
let cachedInvitedCount: number | null = null;
let profileHasFetched = false;

export const clearProfileCache = () => {
    cachedUserData = null;
    cachedInvitedCount = null;
    profileHasFetched = false;
    clearPostsCache();
    clearCollectionsCache();
};

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
    reputation: number;
};

const TABS = ["Posts", "cNFTs"] as const;
type Tab = typeof TABS[number];

/* ─── Stat Column ─── */
const StatColumn = ({
    value, label, onPress, isDark,
}: {
    value: number; label: string; onPress?: () => void; isDark: boolean;
}) => {
    const inner = (
        <View style={st.statCol}>
            <Text style={[st.statValue, { color: isDark ? '#fff' : '#111' }]}>
                {formatNumber(value)}
            </Text>
            <Text style={[st.statLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                {label}
            </Text>
        </View>
    );
    if (onPress) {
        return <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={{ flex: 1 }}>{inner}</TouchableOpacity>;
    }
    return <View style={{ flex: 1 }}>{inner}</View>;
};

/* ─── Divider dot ─── */
const Dot = ({ isDark }: { isDark: boolean }) => (
    <View style={[st.dot, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
);

/* ─── Empty State ─── */
const EmptyState = ({
    Icon, title, description, colorScheme
}: {
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    title: string; description: string;
    colorScheme: "light" | "dark" | null | undefined;
}) => {
    const isDark = colorScheme === 'dark';
    return (
        <View style={{
            marginTop: 20, padding: 30, borderRadius: 24,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginHorizontal: 4,
        }}>
            <View style={{
                backgroundColor: isDark ? 'rgba(88,166,255,0.1)' : 'rgba(88,166,255,0.15)',
                padding: 18, borderRadius: 40, marginBottom: 16,
            }}>
                <Icon size={42} color="#58a6ff" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: isDark ? "#fff" : "#000", marginBottom: 8, textAlign: 'center' }}>
                {title}
            </Text>
            <Text style={{ fontSize: 15, color: isDark ? "#9ca3af" : "#6b7280", textAlign: "center", lineHeight: 22 }}>
                {description}
            </Text>
        </View>
    );
};

/* ══════════════════════════════════
   ProfileView — Minimalist + Blur Header
   ══════════════════════════════════ */
const ProfileView = () => {
    const [userData, setUserData] = useState<UserData>(cachedUserData ?? {
        username: "", about: "", avatar_url: null,
        post_count: 0, cnft_count: 0, readers_count: 0, follows_count: 0,
        official: false, isOg: false, ogEdition: null, reputation: 0,
    });

    const [loading, setLoading] = useState<boolean>(!cachedUserData);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeTab, setActiveTab] = useState<Tab>("Posts");
    const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(["Posts"]));
    const [invitedCount, setInvitedCount] = useState<number>(cachedInvitedCount ?? 0);
    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const [id, setId] = useState<number>();
    const [fetchError, setFetchError] = useState<boolean>(false);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const modalRef = useRef<ShareModalRef>(null);
    const inviteSheetRef = useRef<InviteSheetRef>(null);
    const eventConnectionsSheetRef = useRef<EventConnectionsSheetRef>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [interactionsFinished, setInteractionsFinished] = useState(false);

    useEffect(() => {
        InteractionManager.runAfterInteractions(() => {
            setInteractionsFinished(true);
        });
    }, []);

    const postsOpacity = useSharedValue(1);
    const postsTranslate = useSharedValue(0);
    const cnftsOpacity = useSharedValue(0);
    const cnftsTranslate = useSharedValue(40);
    const prevTabRef = useRef<Tab>("Posts");

    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
    const profileStyle = isDark ? profileDarkStyles : profileLightStyles;
    const router = useRouter();

    const animateTabSwitch = (to: Tab) => {
        const from = prevTabRef.current;
        if (from === to) return;
        prevTabRef.current = to;
        const goingRight = to === "cNFTs";

        if (goingRight) {
            postsOpacity.value = withTiming(0, { duration: 160 });
            postsTranslate.value = withTiming(-40, { duration: 160 });

            cnftsTranslate.value = 40;
            cnftsOpacity.value = 0;
            cnftsOpacity.value = withTiming(1, { duration: 220 });
            cnftsTranslate.value = withSpring(0, { damping: 15, stiffness: 100 });
        } else {
            cnftsOpacity.value = withTiming(0, { duration: 160 });
            cnftsTranslate.value = withTiming(40, { duration: 160 });

            postsTranslate.value = -40;
            postsOpacity.value = 0;
            postsOpacity.value = withTiming(1, { duration: 220 });
            postsTranslate.value = withSpring(0, { damping: 15, stiffness: 100 });
        }
    };

    const handleTabPress = (tab: Tab) => {
        if (tab === activeTab) return;
        setMountedTabs(prev => new Set([...prev, tab]));
        animateTabSwitch(tab);
        setActiveTab(tab);
    };

    const postsAnimatedStyle = useAnimatedStyle(() => ({
        opacity: postsOpacity.value,
        transform: [{ translateX: postsTranslate.value }],
    }));

    const cnftsAnimatedStyle = useAnimatedStyle(() => ({
        opacity: cnftsOpacity.value,
        transform: [{ translateX: cnftsTranslate.value }],
    }));

    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        if (visible) {
            setIsVisibleContainer(true);
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 8 }).start();
        } else {
            Animated.timing(scaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
            timeoutRef.current = setTimeout(() => { setIsVisibleContainer(false) }, 200);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [visible]);

    const fetchUserData = async () => {
        setFetchError(false);
        try {
            const data = await getUserDetail(0);
            if (!data || typeof data !== 'object') {
                throw new Error("Invalid user data received");
            }
            const newData: UserData = {
                username: data.username || "",
                about: data.about || "",
                avatar_url: data.avatar ? `${data.avatar}` : null,
                post_count: data.post_count || 0,
                cnft_count: data.cnft_count || 0,
                readers_count: data.readers_count || 0,
                follows_count: data.follows_count || 0,
                official: data.official === true,
                isOg: data.isOg === true,
                ogEdition: data.edition ?? null,
                reputation: data.reputation || 0,
            };
            setUserData(newData);
            cachedUserData = newData;
            const invited = data.invited_count || 0;
            setInvitedCount(invited);
            cachedInvitedCount = invited;
            profileHasFetched = true;
        } catch (error) {
            console.error("Fetch error reboot page", error);
            setFetchError(true);
            profileHasFetched = false;
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
        profileHasFetched = false;
        clearPostsCache();
        clearCollectionsCache();
        await fetchUserData();
        setRefreshing(false);
    }, [activeTab]);

    const handleOpenModal = () => { modalRef.current?.present(); };

    useEffect(() => { getId(); }, []);

    useFocusEffect(
        useCallback(() => {
            if (!profileHasFetched) {
                fetchUserData();
            }
        }, [])
    );

    const bg = isDark ? '#0A0410' : '#ffffff';

    return (
        <SafeAreaView style={profileStyle.container}>
            <StatusBar animated backgroundColor={bg} />
            {loading ? (
                <ActivityIndicator size="large" color="#58a6ff" style={{ flex: 1, justifyContent: "center", alignItems: "center" }} />
            ) : fetchError && !userData.username ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
                    <Text style={{ fontSize: 18, fontFamily: 'Dank Mono Bold', color: isDark ? '#fff' : '#000', marginBottom: 8, textAlign: 'center' }}>
                        Failed to load profile
                    </Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Dank Mono', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center', marginBottom: 24 }}>
                        Please check your internet connection and try again.
                    </Text>
                    <TouchableOpacity
                        onPress={() => {
                            setLoading(true);
                            setFetchError(false);
                            fetchUserData();
                        }}
                        style={{
                            backgroundColor: '#A855F7',
                            paddingHorizontal: 24,
                            paddingVertical: 12,
                            borderRadius: 14,
                        }}
                    >
                        <Text style={{ color: '#fff', fontFamily: 'Dank Mono Bold', fontSize: 14 }}>Tap to Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 20 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing} onRefresh={onRefresh}
                            tintColor={isDark ? "#fff" : "#000"}
                            colors={["#58a6ff"]}
                            progressBackgroundColor={isDark ? "#000" : "#fff"}
                        />
                    }
                >
                    {/* Avatar fullscreen modal */}
                    <Modal transparent visible={isVisibleContainer} animationType="fade">
                        <TouchableOpacity
                            style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.75)" }}
                            activeOpacity={1} onPress={() => setVisible(false)}
                        >
                            <Animated.View style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center", width: '100%', transform: [{ scale: scaleAnim }] }}>
                                {userData.avatar_url && (
                                    <Image
                                        style={{ width: 320, height: 320, borderRadius: 160 }}
                                        source={{ uri: userData.avatar_url as string }}
                                        contentFit="cover"
                                    />
                                )}
                            </Animated.View>
                        </TouchableOpacity>
                    </Modal>

                    {/* ═══════════════════════════════
                        BLURRED AVATAR HEADER
                        — the avatar image, scaled up, blurred,
                          fading into the background on all edges.
                    ═══════════════════════════════ */}
                    <FadeIn from="top" duration={400} delay={50}>
                        <View style={st.headerContainer}>
                            {userData.avatar_url && (
                                <>
                                    <Image
                                        source={{ uri: userData.avatar_url }}
                                        style={[st.headerImage, { opacity: 0.38 }]}
                                        contentFit="cover"
                                    />
                                    <View style={[StyleSheet.absoluteFill, {
                                        backgroundColor: isDark
                                            ? 'rgba(6, 3, 16, 0.72)'
                                            : 'rgba(245, 240, 255, 0.72)'
                                    }]} />
                                </>
                            )}
                            {/* Bottom fade */}
                            <LinearGradient
                                colors={['transparent', bg]}
                                locations={[0.2, 1]}
                                style={st.headerFadeBottom}
                            />
                            {/* Top fade */}
                            <LinearGradient
                                colors={[bg, 'transparent']}
                                locations={[0, 0.5]}
                                style={st.headerFadeTop}
                            />
                            {/* Left fade */}
                            <LinearGradient
                                colors={[bg, 'transparent']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                locations={[0, 0.4]}
                                style={st.headerFadeLeft}
                            />
                            {/* Right fade */}
                            <LinearGradient
                                colors={['transparent', bg]}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                locations={[0.6, 1]}
                                style={st.headerFadeRight}
                            />

                            {/* Top bar overlaid on header */}
                            <View style={st.topBar}>
                                <ButtonSettings />
                                <View style={{ flex: 1 }} />
                                <ButtonWallet />
                            </View>
                        </View>
                    </FadeIn>

                    {/* ── Avatar centered, overlapping header ── */}
                    <TouchableOpacity
                        onPress={() => { if (userData.avatar_url) setVisible(true); }}
                        activeOpacity={0.85}
                        style={st.avatarWrap}
                    >
                        <AvatarWithFrame
                            avatarUrl={userData.avatar_url}
                            size={90}
                            invitedCount={invitedCount}
                            isOg={userData.isOg}
                            ogEdition={userData.ogEdition}
                        />
                    </TouchableOpacity>

                    {/* ── Name ── */}
                    <View style={st.nameRow}>
                        <Text style={[st.nameText, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
                            {userData.username}
                        </Text>
                        {userData.official && (
                            <View style={{ marginLeft: 4 }}>
                                <VerifyBadge isLooped={true} isVisible={true} haveModal={true} isStatic={false} size={22} />
                            </View>
                        )}
                    </View>

                    {/* ── Reputation badge ── */}
                    <View style={st.repRow}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => eventConnectionsSheetRef.current?.present(userData.reputation)}
                            style={[st.repBadge, {
                                backgroundColor: isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.1)',
                                borderColor: isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.25)',
                            }]}
                        >
                            <Star size={12} color="#22c55e" fill="#22c55e" />
                            <Text style={[st.repText, { color: isDark ? '#22c55e' : '#16a34a' }]}>
                                {formatNumber(userData.reputation)} rep
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Bio ── */}
                    {userData.about !== "" && (
                        <View style={st.bioWrap}>
                            <Hyperlink
                                linkStyle={{ color: "#A78BFA", fontWeight: "500" }}
                                onPress={(url: string) => Linking.openURL(url)}
                            >
                                <Text style={[st.bioText, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>
                                    {userData.about}
                                </Text>
                            </Hyperlink>
                        </View>
                    )}

                    {/* ── Stats ── */}
                    <View style={st.statsRow}>
                        <StatColumn value={userData.post_count} label="Posts" isDark={isDark} />
                        <Dot isDark={isDark} />
                        <StatColumn
                            value={userData.readers_count} label="Readers" isDark={isDark}
                            onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Readers" } })}
                        />
                        <Dot isDark={isDark} />
                        <StatColumn
                            value={userData.follows_count} label="Follows" isDark={isDark}
                            onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Follows" } })}
                        />
                    </View>

                    {/* ── Divider ── */}
                    <View style={[st.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />

                    {/* ── Action buttons ── */}
                    <View style={st.actionsRow}>
                        {Platform.OS !== 'ios' && (
                            <View style={{ flex: 1.2 }}>
                                <ShareViaNFC handlePress={handleOpenModal} />
                            </View>
                        )}
                        <View style={{ flex: 0.9 }}>
                            <InviteSecondaryButton handlePress={() => inviteSheetRef.current?.present()} />
                        </View>
                        <View style={{ flex: 0.9 }}>
                            <TouchableOpacity
                                activeOpacity={0.84}
                                onPress={() => router.push("/events")}
                                style={[st.eventsBtn, {
                                    borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                                }]}
                            >
                                <Calendar size={18} color="#A855F7" />
                                <Text style={st.eventsBtnText}>Events</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Tabs ── */}
                    <View style={[st.tabBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab;
                            const tabLabel = tab === "Posts" ? `Posts (${userData.post_count})` : `Collectibles (${userData.cnft_count})`;
                            return (
                                <TouchableOpacity
                                    key={tab} onPress={() => handleTabPress(tab)}
                                    style={{ flex: 1, borderRadius: 13, overflow: "hidden" }}
                                    activeOpacity={0.8}
                                >
                                    {isActive ? (
                                        <LinearGradient
                                            colors={["rgba(167,139,250,0.25)", "rgba(139,92,246,0.15)"]}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={st.tabActive}
                                        >
                                            <Text style={st.tabActiveText}>{tabLabel}</Text>
                                        </LinearGradient>
                                    ) : (
                                        <View style={st.tabInactive}>
                                            <Text style={[st.tabInactiveText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                                                {tabLabel}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* ── Tab Content ── */}
                    <View style={{ overflow: "hidden" }}>
                        <AnimatedReanimated.View style={[postsAnimatedStyle, {
                            display: activeTab === "Posts" ? "flex" : "none",
                        }]}>
                            {mountedTabs.has("Posts") && (
                                userData.post_count === 0 ? (
                                    <EmptyState Icon={Camera} title="No Posts Yet"
                                        description="Start sharing your moments to make your profile more engaging."
                                        colorScheme={colorScheme} />
                                ) : (
                                    interactionsFinished ? <PostGallery key={`posts-${refreshKey}`} id={id as number} previous="profile" /> : <ActivityIndicator size="large" color="#58a6ff" style={{ marginTop: 40 }} />
                                )
                            )}
                        </AnimatedReanimated.View>
                        <AnimatedReanimated.View style={[cnftsAnimatedStyle, {
                            display: activeTab === "cNFTs" ? "flex" : "none",
                        }]}>
                            {mountedTabs.has("cNFTs") && (
                                userData.cnft_count === 0 ? (
                                    <EmptyState Icon={Layers} title="No cNFTs Yet"
                                        description="Your collected and created cNFTs will appear here."
                                        colorScheme={colorScheme} />
                                ) : (
                                    interactionsFinished ? <CollectionsGallery key={`collections-${refreshKey}`} id={id as number} isOwnProfile={true} /> : <ActivityIndicator size="large" color="#58a6ff" style={{ marginTop: 40 }} />
                                )
                            )}
                        </AnimatedReanimated.View>
                    </View>
                </ScrollView>
            )}

            {/* Bottom sheets */}
            <ShareModal ref={modalRef} avatarUrl={userData.avatar_url} profileUrl={`https://nextvibe.io/u/${id}`} />
            <InviteBottomSheet ref={inviteSheetRef} />
            <EventConnectionsSheet ref={eventConnectionsSheetRef} />
        </SafeAreaView>
    );
};

/* ─── Styles ─── */
const st = StyleSheet.create({
    headerContainer: {
        height: HEADER_HEIGHT,
        width: SCREEN_WIDTH,
        marginLeft: -16,
        marginTop: 10,
        overflow: 'hidden',
        position: 'relative',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    headerImage: {
        width: '100%',
        height: '100%',
        transform: [{ scale: 1.3 }],
    },
    headerFadeBottom: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '65%',
    },
    headerFadeTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: '40%',
    },
    headerFadeLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '25%',
    },
    headerFadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '25%',
    },
    topBar: {
        position: 'absolute',
        top: 8,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarWrap: {
        alignSelf: 'center',
        marginTop: -50,
        marginBottom: 14,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    nameText: {
        fontSize: 22,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    repRow: {
        alignItems: 'center',
        marginBottom: 8,
    },
    repBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    repText: {
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    bioWrap: {
        paddingHorizontal: 32,
        marginBottom: 20,
    },
    bioText: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        textAlign: 'center',
        lineHeight: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    statCol: {
        alignItems: 'center',
        gap: 2,
    },
    statValue: {
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    statLabel: {
        fontSize: 11,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        marginHorizontal: 16,
    },
    divider: {
        height: 1,
        marginHorizontal: 40,
        marginBottom: 16,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
    },
    eventsBtn: {
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    eventsBtnText: {
        color: '#A855F7',
        fontFamily: 'Dank Mono Bold',
        fontSize: 12,
        includeFontPadding: false,
    },
    tabBar: {
        marginBottom: 20,
        flexDirection: 'row',
        borderRadius: 16,
        padding: 4,
    },
    tabActive: {
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 13,
        borderWidth: 1,
        borderColor: 'rgba(167,139,250,0.3)',
    },
    tabActiveText: {
        color: '#a78bfa',
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    tabInactive: {
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 13,
    },
    tabInactiveText: {
        fontSize: 13,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
});

export default ProfileView;