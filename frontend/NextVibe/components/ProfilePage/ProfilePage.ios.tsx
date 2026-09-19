import { useState, useCallback, useEffect, useRef } from "react";
import {
    View,
    SafeAreaView,
    Text,

    Modal,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FrostedView from "@/components/Shared/FrostedView";
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AvatarWithFrame } from "./AvatarWithFrame";
import Hyperlink from 'react-native-hyperlink';
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Star, Camera, Layers, Calendar, ChevronRight, Share2, Users } from "lucide-react-native";

import getUserDetail from "@/src/api/user.detail";
import { storage } from '@/src/utils/storage';
import formatNumber from "@/src/utils/formatNumber";

import ButtonSettings from "./ButtonSettings";
import ButtonWallet from "./ButtonWallet";
import PostGallery, { clearPostsCache } from "./PostsMenu";
import CollectionsGallery, { clearCollectionsCache } from "./CollectionsMenu";
import { ActivityIndicator } from "../CustomActivityIndicator";
import UserBadges from "../Shared/UserBadges";
import SeekerBadgeSheet, { SeekerBadgeSheetRef } from "../Shared/SeekerBadgeSheet";
import { SEEKER_OPEN_PARAM } from "@/src/navigation/intents";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";
import { useSeekerIntro } from "@/src/stores/seekerIntroStore";

import haptics from "@/src/utils/haptics";
import { space } from "@/src/theme/tokens";
import { TapToMeetButton } from "./TapToMeet/TapToMeetButton";
import ShareModal, { ShareModalRef } from './ShareViaNFC/ShareBottomModal';

import { SecondaryActionButton } from "./SecondaryActionButton";
import { InviteBottomSheet, InviteSheetRef } from "./Invite/InviteBottomSheet";

import { EventConnectionsSheet, EventConnectionsSheetRef } from "./EventConnectionsSheet";

import profileDarkStyles from "@/styles/dark-theme/profileStyles";
import profileLightStyles from "@/styles/light-theme/profileStyles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_HEIGHT = 200;

/** Push taps / links already shown (`intent` param), so a remount can't reopen the sheet. */
const handledSeekerIntents = new Set<string>();
/** Let the screen finish arriving (tab switch / splash replace) before sliding up. */
const SEEKER_SHEET_DELAY_MS = 350;

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
    seeker_verified: boolean;
    seeker_verified_source: string | null;
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
    const insets = useSafeAreaInsets();
    const [userData, setUserData] = useState<UserData>(cachedUserData ?? {
        username: "", about: "", avatar_url: null,
        post_count: 0, cnft_count: 0, readers_count: 0, follows_count: 0,
        official: false, seeker_verified: false, seeker_verified_source: null, isOg: false, ogEdition: null, reputation: 0,
    });

    const [loading, setLoading] = useState<boolean>(!cachedUserData);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeTab, setActiveTab] = useState<Tab>("Posts");
    const [invitedCount, setInvitedCount] = useState<number>(cachedInvitedCount ?? 0);
    const [visible, setVisible] = useState<boolean>(false);
    const [isVisibleContainer, setIsVisibleContainer] = useState<boolean>(false);
    const [id, setId] = useState<number>();
    const [fetchError, setFetchError] = useState<boolean>(false);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const modalRef = useRef<ShareModalRef>(null);
    const inviteSheetRef = useRef<InviteSheetRef>(null);
    const eventConnectionsSheetRef = useRef<EventConnectionsSheetRef>(null);
    const seekerSheetRef = useRef<SeekerBadgeSheetRef>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [interactionsFinished, setInteractionsFinished] = useState(false);

    useEffect(() => {
        InteractionManager.runAfterInteractions(() => {
            setInteractionsFinished(true);
        });
    }, []);

    const postsOpacity = useRef(new Animated.Value(1)).current;
    const postsTranslateX = useRef(new Animated.Value(0)).current;
    const cnftsOpacity = useRef(new Animated.Value(0)).current;
    const cnftsTranslateX = useRef(new Animated.Value(40)).current;
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
            Animated.parallel([
                Animated.timing(postsOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
                Animated.timing(postsTranslateX, { toValue: -40, duration: 160, useNativeDriver: true }),
            ]).start();

            cnftsTranslateX.setValue(40);
            cnftsOpacity.setValue(0);
            Animated.parallel([
                Animated.timing(cnftsOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(cnftsTranslateX, { toValue: 0, damping: 15, stiffness: 100, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(cnftsOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
                Animated.timing(cnftsTranslateX, { toValue: 40, duration: 160, useNativeDriver: true }),
            ]).start();

            postsTranslateX.setValue(-40);
            postsOpacity.setValue(0);
            Animated.parallel([
                Animated.timing(postsOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(postsTranslateX, { toValue: 0, damping: 15, stiffness: 100, useNativeDriver: true }),
            ]).start();
        }
    };

    const handleTabPress = (tab: Tab) => {
        if (tab === activeTab) return;
        haptics.selection();
        animateTabSwitch(tab);
        setActiveTab(tab);
    };

    const postsAnimatedStyle = {
        opacity: postsOpacity,
        transform: [{ translateX: postsTranslateX }],
    };

    const cnftsAnimatedStyle = {
        opacity: cnftsOpacity,
        transform: [{ translateX: cnftsTranslateX }],
    };

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
                seeker_verified: data.seeker_verified === true,
                seeker_verified_source: data.seeker_verified_source ?? null,
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
        profileHasFetched = false;
        clearPostsCache();
        clearCollectionsCache();
        await fetchUserData();
        setRefreshing(false);
    }, [activeTab]);

    const handleOpenModal = () => { modalRef.current?.present(); };

    useEffect(() => { getId(); }, []);

    // First-grant moment: after the seeker_verified push, the badge sheet opens once by itself
    const isFocused = useIsFocused();
    const introPending = useSeekerIntro((state) => id !== undefined && state.pendingFor === String(id));
    const markIntroShown = useSeekerIntro((state) => state.markShown);

    useEffect(() => {
        if (id) useSeekerIntro.getState().restore(String(id));
    }, [id]);

    // Seeker Verified sheet, opened by a push tap / deep link (?open=seeker,
    // set by the root layout's intent consumer) or by the first-grant intro
    // (badge granted while the app was open). Waits until the profile is
    // focused, laid out and loaded with seeker_verified, then presents once and
    // clears the param so re-renders and back navigation can't reopen it.
    const { open: openParam, intent: intentParam } = useLocalSearchParams<{ open?: string; intent?: string }>();
    const [seekerSheetNew, setSeekerSheetNew] = useState(false);
    const [seekerRecheck, setSeekerRecheck] = useState(0);
    const seekerRefetchedRef = useRef(false);
    const openRequested = openParam === SEEKER_OPEN_PARAM && !(intentParam && handledSeekerIntents.has(intentParam));
    const wantsSeekerSheet = openRequested || introPending;
    // The delayed present() below reads these, not the values from when it was scheduled.
    const seekerLatestRef = useRef({ openParam, intentParam });
    seekerLatestRef.current = { openParam, intentParam };

    useEffect(() => {
        // A stale ?open=seeker for a tap that was already shown: just drop it.
        if (openParam === SEEKER_OPEN_PARAM && !openRequested && isFocused) router.setParams({ open: undefined, intent: undefined });
    }, [openParam, openRequested, isFocused]);

    useEffect(() => {
        if (!wantsSeekerSheet) {
            seekerRefetchedRef.current = false;
            return;
        }
        if (!isFocused || !interactionsFinished || loading) return;

        if (!userData.seeker_verified) {
            // Cached data can predate the badge: fetch once before deciding.
            if (!seekerRefetchedRef.current) {
                seekerRefetchedRef.current = true;
                profileHasFetched = false;
                fetchUserData().finally(() => setSeekerRecheck((n) => n + 1));
                return;
            }
            // Not Seeker Verified after all: ignore the request silently.
            if (openRequested) {
                walletLogger.info(WalletTag.NAV_INTENT, 'Profile: open=seeker ignored (not Seeker Verified)');
                if (intentParam) handledSeekerIntents.add(intentParam);
                router.setParams({ open: undefined, intent: undefined });
            }
            return;
        }

        let cancelled = false;
        let frame = 0;
        let attempts = 0;
        const attempt = () => {
            if (cancelled) return;
            const sheet = seekerSheetRef.current;
            if (!sheet) {
                // The sheet is always rendered, but give its ref a few frames.
                if (attempts++ < 30) frame = requestAnimationFrame(attempt);
                return;
            }
            const latest = seekerLatestRef.current;
            setSeekerSheetNew(true);
            sheet.present();
            walletLogger.info(WalletTag.NAV_INTENT, 'Profile: Seeker sheet presented', { open: latest.openParam, intent: latest.intentParam });
            // One sheet covers both the intro and the tap: settle both, so
            // neither can reopen it on the next focus.
            markIntroShown(); // no-op when no intro is pending
            if (latest.openParam === SEEKER_OPEN_PARAM) {
                if (latest.intentParam) handledSeekerIntents.add(latest.intentParam);
                router.setParams({ open: undefined, intent: undefined });
            }
        };
        const timer = setTimeout(attempt, SEEKER_SHEET_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            cancelAnimationFrame(frame);
        };
    }, [wantsSeekerSheet, isFocused, interactionsFinished, loading, userData.seeker_verified, seekerRecheck]);

    useFocusEffect(
        useCallback(() => {
            if (!profileHasFetched) {
                fetchUserData();
            }
        }, [])
    );

    const bg = isDark ? '#0A0410' : '#ffffff';
    const bgTransparent = isDark ? 'rgba(10, 4, 16, 0)' : 'rgba(255, 255, 255, 0)';
    const refreshControl = (
        <RefreshControl
            refreshing={refreshing} onRefresh={onRefresh}
            tintColor={isDark ? "#fff" : "#000"}
            colors={["#58a6ff"]}
            progressBackgroundColor={isDark ? "#000" : "#fff"}
        />
    );

    const profileHeader = (
        <>
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

            {/* Spacer to push profile details down */}
            <View style={{ height: Math.max(0, HEADER_HEIGHT - insets.top) }} />

            {/* ── Profile content wrapper (restores 16px horizontal padding below the header) ── */}
            <View style={{ paddingHorizontal: 16 }}>
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

                <View style={st.nameRow}>
                    <Text style={[st.nameText, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
                        {userData.username}
                    </Text>
                    <UserBadges
                        official={userData.official}
                        seekerVerified={userData.seeker_verified}
                        isLooped={true}
                        isVisible={true}
                        haveModal={true}
                        isStatic={false}
                        size={20}
                        seekerInfoOnTap={true}
                        seekerSource={userData.seeker_verified_source}
                        seekerShareUsername={userData.username}
                        seekerSheetRef={seekerSheetRef}
                    />
                    <TouchableOpacity
                        onPress={handleOpenModal}
                        hitSlop={8}
                        accessibilityLabel="Share profile"
                        style={{ marginLeft: 8 }}
                    >
                        <Share2 size={16} color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)'} />
                    </TouchableOpacity>
                </View>

                <View style={st.repRow}>
                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => eventConnectionsSheetRef.current?.present(userData.reputation)}
                        style={[st.repBadgeInteractive, {
                            backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.12)',
                            borderColor: isDark ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.4)',
                        }]}
                    >
                        <View style={st.repBadgeLeft}>
                            <View style={st.repStarCircle}>
                                <Star size={11} color="#22c55e" fill="#22c55e" />
                            </View>
                            <Text style={[st.repTextMain, { color: isDark ? '#4ade80' : '#16a34a' }]}>
                                {formatNumber(userData.reputation)} <Text style={st.repTextSub}>REP</Text>
                            </Text>
                        </View>

                        <View style={st.repDivider} />

                        <View style={st.repBadgeRight}>
                            <Text style={[st.repActionTxt, { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(17,24,39,0.7)' }]}>
                                POAPs & History
                            </Text>
                            <ChevronRight size={13} color={isDark ? '#4ade80' : '#16a34a'} />
                        </View>
                    </TouchableOpacity>
                </View>

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

                <View style={st.statsRow}>
                    <StatColumn value={userData.post_count} label="Posts" isDark={isDark} />
                    <Dot isDark={isDark} />
                    <StatColumn
                        value={userData.readers_count} label="Followers" isDark={isDark}
                        onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Readers" } })}
                    />
                    <Dot isDark={isDark} />
                    <StatColumn
                        value={userData.follows_count} label="Following" isDark={isDark}
                        onPress={() => router.push({ pathname: "/follows-screen", params: { last_page: "/profile", userId: id, username: userData.username, activeTab: "Follows" } })}
                    />
                </View>

                <View style={[st.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />

                <View style={st.actionsCol}>
                    <TapToMeetButton />
                    <View style={st.secondaryRow}>
                        <View style={{ flex: 1 }}>
                            <SecondaryActionButton icon={Users} label="Invite" onPress={() => inviteSheetRef.current?.present()} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <SecondaryActionButton icon={Calendar} label="Events" onPress={() => router.push("/events")} />
                        </View>
                    </View>
                </View>

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
            </View>
        </>
    );

    return (
        <View style={[profileStyle.container, { paddingHorizontal: 0 }]}>
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
                <>
                    {/* iOS Absolute Background Header */}
                    {userData.avatar_url && (
                        <View style={st.headerContainerAbsolute}>
                            <View style={st.headerClip}>
                                <Image
                                    source={{ uri: userData.avatar_url }}
                                    style={[st.headerImage, { opacity: isDark ? 0.45 : 0.65 }]}
                                    contentFit="cover"
                                    blurRadius={40}
                                />
                                <FrostedView
                                    intensity={75}
                                    tint={isDark ? 'dark' : 'light'}
                                    style={StyleSheet.absoluteFill}
                                    fallbackBackgroundColor={
                                        isDark ? 'rgba(10, 4, 16, 0.72)' : 'rgba(255, 255, 255, 0.35)'
                                    }
                                />
                                <View style={[StyleSheet.absoluteFill, {
                                    backgroundColor: isDark
                                        ? 'rgba(10, 4, 16, 0.72)'
                                        : 'rgba(255, 255, 255, 0.35)'
                                }]} />
                                {/* Bottom fade */}
                                <LinearGradient
                                    colors={[bgTransparent, bg]}
                                    locations={[0.2, 1]}
                                    style={st.headerFadeBottom}
                                />
                            </View>
                        </View>
                    )}

                    {/* Both galleries stay mounted AND laid out; `display: none` would
                        drop the hidden list's layout and force a full re-layout (visible
                        as the whole page "reloading") on every tab switch. */}
                    <Animated.View
                        pointerEvents={activeTab === 'Posts' ? 'auto' : 'none'}
                        style={[postsAnimatedStyle, StyleSheet.absoluteFill, { zIndex: activeTab === 'Posts' ? 1 : 0 }]}
                    >
                            {interactionsFinished ? (
                                <PostGallery
                                    key={`posts-${refreshKey}`}
                                    id={id as number}
                                    previous="profile"
                                    ListHeaderComponent={profileHeader}
                                    ListEmptyComponent={
                                        <EmptyState Icon={Camera} title="No Posts Yet"
                                            description="Start sharing your moments to make your profile more engaging."
                                            colorScheme={isDark ? "dark" : "light"} />
                                    }
                                    refreshControl={refreshControl}
                                    contentInset={{ top: insets.top }}
                                    contentOffset={{ x: 0, y: -insets.top }}
                                    contentInsetAdjustmentBehavior="never"
                                    automaticallyAdjustContentInsets={false}
                                />
                            ) : (
                                <ActivityIndicator size="large" color="#58a6ff" style={{ marginTop: 40 }} />
                            )}
                        </Animated.View>
                        <Animated.View
                            pointerEvents={activeTab === 'cNFTs' ? 'auto' : 'none'}
                            style={[cnftsAnimatedStyle, StyleSheet.absoluteFill, { zIndex: activeTab === 'cNFTs' ? 1 : 0 }]}
                        >
                            {interactionsFinished ? (
                                <CollectionsGallery
                                    key={`collections-${refreshKey}`}
                                    id={id as number}
                                    isOwnProfile={true}
                                    ListHeaderComponent={profileHeader}
                                    ListEmptyComponent={
                                        <EmptyState Icon={Layers} title="No cNFTs Yet"
                                            description="Your collected and created cNFTs will appear here."
                                            colorScheme={isDark ? "dark" : "light"} />
                                    }
                                    refreshControl={refreshControl}
                                    contentInset={{ top: insets.top }}
                                    contentOffset={{ x: 0, y: -insets.top }}
                                    contentInsetAdjustmentBehavior="never"
                                    automaticallyAdjustContentInsets={false}
                                />
                            ) : (
                                <ActivityIndicator size="large" color="#58a6ff" style={{ marginTop: 40 }} />
                            )}
                        </Animated.View>

            {/* Fixed Settings/Wallet Top Bar with safe area top inset */}
            <View style={[st.topBar, { top: insets.top > 0 ? insets.top + 8 : 8 }]}>
                <ButtonSettings />
                <View style={{ flex: 1 }} />
                <ButtonWallet />
            </View>
        </>
    )}

            {/* Bottom sheets */}
            <ShareModal ref={modalRef} avatarUrl={userData.avatar_url} profileUrl={`https://nextvibe.io/u/${id}`} />
            <InviteBottomSheet ref={inviteSheetRef} />
            <EventConnectionsSheet ref={eventConnectionsSheetRef} />
            {/* Always mounted, so a push tap / deep link can present it as soon as data is in */}
            <SeekerBadgeSheet
                ref={seekerSheetRef}
                source={userData.seeker_verified_source}
                shareUsername={userData.username || null}
                isNew={seekerSheetNew}
                onDismiss={() => setSeekerSheetNew(false)}
            />
        </View>
    );
};

/* ─── Styles ─── */
const st = StyleSheet.create({
    headerContainerAbsolute: {
        position: 'absolute',
        top: -20,
        left: -20,
        right: -20,
        height: HEADER_HEIGHT + 20,
        zIndex: 0,
    },
    headerContainer: {
        height: HEADER_HEIGHT,
        width: '100%',
        position: 'relative',
    },
    headerClip: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
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
        height: '40%',
    },
    headerFadeTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: '25%',
    },
    headerFadeLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '15%',
    },
    headerFadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '15%',
    },
    topBar: {
        position: 'absolute',
        top: 8,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10,
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
        lineHeight: 24,
        flexShrink: 1,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    repRow: {
        alignItems: 'center',
        marginBottom: 10,
    },
    repBadgeInteractive: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1.5,
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
    },
    repBadgeLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    repStarCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(34,197,94,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    repTextMain: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    repTextSub: {
        fontSize: 11,
        fontFamily: 'Dank Mono Bold',
    },
    repDivider: {
        width: 1,
        height: 14,
        backgroundColor: 'rgba(34,197,94,0.3)',
        marginHorizontal: 10,
    },
    repBadgeRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    repActionTxt: {
        fontSize: 11,
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
    actionsCol: {
        gap: space.sm,
        marginBottom: space.lg + space.xs,
    },
    secondaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
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
