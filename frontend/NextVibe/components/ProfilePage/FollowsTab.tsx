import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, useColorScheme, StatusBar,
    Animated, FlatList, RefreshControl, ActivityIndicator, TextInput
} from "react-native";
import { Ghost, Telescope, ArrowLeft, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import getFollows from '@/src/api/get.follows';
import getReaders from '@/src/api/get.readers';
import getUserDetail from '@/src/api/user.detail';
import followUser from '@/src/api/follow';
import { storage } from '@/src/utils/storage';
import { Image } from 'expo-image';
import UserBadges from '../Shared/UserBadges';
import haptics from '@/src/utils/haptics';

type UserData = {
    user_id: number;
    username: string;
    avatar: string | null;
    official: boolean;
    seeker_verified: boolean;
}

// Internal tab keys stay 'Readers'/'Follows' — profile screens navigate here
// with these values; only the visible labels changed.
const TAB_KEYS = ['Readers', 'Follows'] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABELS: Record<TabKey, string> = { Readers: 'Followers', Follows: 'Following' };

const SkeletonRow = ({ isDark, opacity }: { isDark: boolean; opacity: Animated.Value }) => {
    const tone = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    return (
        <View style={[skeletonStyles.card, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(0,0,0,0.06)',
        }]}>
            <Animated.View style={[skeletonStyles.avatar, { backgroundColor: tone, opacity }]} />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Animated.View style={[skeletonStyles.line, { width: 120, backgroundColor: tone, opacity }]} />
            </View>
            <Animated.View style={[skeletonStyles.pill, { backgroundColor: tone, opacity }]} />
        </View>
    );
};

const skeletonStyles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 5,
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    avatar: { width: 48, height: 48, borderRadius: 24 },
    line: { height: 14, borderRadius: 7 },
    pill: { width: 84, height: 32, borderRadius: 16 },
});

export default function FollowsScreen() {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const { activeTab, userId, username } = useLocalSearchParams();
    const userIdStr = Array.isArray(userId) ? userId[0] : userId;

    const [activeTabState, setActiveTabState] = useState<TabKey>(
        activeTab === 'Follows' ? 'Follows' : 'Readers'
    );
    const [searchQuery, setSearchQuery] = useState('');

    // My own id + who I follow — powers the Follow/Following buttons
    const [myId, setMyId] = useState<number | null>(null);
    const [myFollowing, setMyFollowing] = useState<Set<number>>(new Set());
    const [pendingFollowIds, setPendingFollowIds] = useState<Set<number>>(new Set());

    // State for Followers (key 'Readers')
    const [readersData, setReadersData] = useState<UserData[]>([]);
    const [readersIndex, setReadersIndex] = useState(0);
    const [readersLoading, setReadersLoading] = useState(false);
    const [isReadersEnd, setIsReadersEnd] = useState(false);
    const [readersRefreshing, setReadersRefreshing] = useState(false);
    const [readersInitialized, setReadersInitialized] = useState(false);

    // State for Following (key 'Follows')
    const [followsData, setFollowsData] = useState<UserData[]>([]);
    const [followsIndex, setFollowsIndex] = useState(0);
    const [followsLoading, setFollowsLoading] = useState(false);
    const [isFollowsEnd, setIsFollowsEnd] = useState(false);
    const [followsRefreshing, setFollowsRefreshing] = useState(false);
    const [followsInitialized, setFollowsInitialized] = useState(false);

    const skeletonOpacity = useRef(new Animated.Value(0.45)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(skeletonOpacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
                Animated.timing(skeletonOpacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [skeletonOpacity]);

    useEffect(() => {
        let cancelled = false;
        const loadMe = async () => {
            try {
                const storedId = await storage.getItem('id');
                if (storedId && !cancelled) setMyId(Number(storedId));
                const me = await getUserDetail();
                if (!cancelled && Array.isArray(me?.follow_for)) {
                    setMyFollowing(new Set<number>(me.follow_for.map((v: any) => Number(v))));
                }
            } catch { }
        };
        loadMe();
        return () => { cancelled = true; };
    }, []);

    const resetAllData = useCallback(() => {
        setReadersData([]);
        setFollowsData([]);
        setReadersIndex(0);
        setFollowsIndex(0);
        setIsReadersEnd(false);
        setIsFollowsEnd(false);
        setReadersInitialized(false);
        setFollowsInitialized(false);
        setSearchQuery('');
    }, []);

    // Reset only when the viewed user actually changes — previously the lists
    // were wiped and refetched on every focus (e.g. returning from a profile).
    const lastUserIdRef = useRef<string | undefined>(undefined);
    useFocusEffect(
        useCallback(() => {
            if (lastUserIdRef.current !== userIdStr) {
                lastUserIdRef.current = userIdStr;
                resetAllData();
                setActiveTabState(activeTab === 'Follows' ? 'Follows' : 'Readers');
            }
        }, [userIdStr, activeTab, resetAllData])
    );

    // Fetch Followers
    const fetchReaders = useCallback(async (isRefresh = false) => {
        if (readersLoading || (!isRefresh && isReadersEnd)) return;

        setReadersLoading(true);
        const currentIndex = isRefresh ? 0 : readersIndex;

        try {
            const data = await getReaders(Number(userIdStr), currentIndex);

            if (data.end) {
                setIsReadersEnd(true);
            }

            if (isRefresh) {
                setReadersData(data.data || []);
                setReadersIndex((data.data || []).length);
                setReadersInitialized(true);
            } else {
                const newItems = (data.data || []).filter((item: UserData) =>
                    !readersData.some(existing => existing.user_id === item.user_id)
                );
                setReadersData(prev => [...prev, ...newItems]);
                setReadersIndex(prev => prev + newItems.length);
            }
        } catch (error) {
            console.error("Failed to fetch followers:", error);
        } finally {
            setReadersLoading(false);
            if (isRefresh) setReadersRefreshing(false);
        }
    }, [readersLoading, isReadersEnd, readersIndex, readersData, userIdStr]);

    // Fetch Following
    const fetchFollows = useCallback(async (isRefresh = false) => {
        if (followsLoading || (!isRefresh && isFollowsEnd)) return;

        setFollowsLoading(true);
        const currentIndex = isRefresh ? 0 : followsIndex;

        try {
            const data = await getFollows(Number(userIdStr), currentIndex);

            if (data.end) {
                setIsFollowsEnd(true);
            }

            if (isRefresh) {
                setFollowsData(data.data || []);
                setFollowsIndex((data.data || []).length);
                setFollowsInitialized(true);
            } else {
                const newItems = (data.data || []).filter((item: UserData) =>
                    !followsData.some(existing => existing.user_id === item.user_id)
                );
                setFollowsData(prev => [...prev, ...newItems]);
                setFollowsIndex(prev => prev + newItems.length);
            }
        } catch (error) {
            console.error("Failed to fetch following:", error);
        } finally {
            setFollowsLoading(false);
            if (isRefresh) setFollowsRefreshing(false);
        }
    }, [followsLoading, isFollowsEnd, followsIndex, followsData, userIdStr]);

    const onRefresh = useCallback(() => {
        if (activeTabState === 'Readers') {
            setReadersRefreshing(true);
            setReadersData([]);
            setReadersIndex(0);
            setIsReadersEnd(false);
            fetchReaders(true);
        } else {
            setFollowsRefreshing(true);
            setFollowsData([]);
            setFollowsIndex(0);
            setIsFollowsEnd(false);
            fetchFollows(true);
        }
    }, [activeTabState, fetchReaders, fetchFollows]);

    // Initial load per tab
    useEffect(() => {
        if (userIdStr && activeTabState === 'Readers' && !readersInitialized && !readersLoading) {
            fetchReaders(true);
        }
    }, [userIdStr, activeTabState, readersInitialized, readersLoading, fetchReaders]);

    useEffect(() => {
        if (userIdStr && activeTabState === 'Follows' && !followsInitialized && !followsLoading) {
            fetchFollows(true);
        }
    }, [userIdStr, activeTabState, followsInitialized, followsLoading, fetchFollows]);

    const loadMoreReaders = useCallback(() => {
        if (!readersLoading && !isReadersEnd && readersInitialized) {
            fetchReaders();
        }
    }, [readersLoading, isReadersEnd, readersInitialized, fetchReaders]);

    const loadMoreFollows = useCallback(() => {
        if (!followsLoading && !isFollowsEnd && followsInitialized) {
            fetchFollows();
        }
    }, [followsLoading, isFollowsEnd, followsInitialized, fetchFollows]);

    const handleTabPress = (tab: TabKey) => {
        if (tab === activeTabState) return;
        haptics.selection();
        setActiveTabState(tab);
        setSearchQuery('');
    };

    const handleToggleFollow = async (targetId: number) => {
        if (pendingFollowIds.has(targetId)) return;
        haptics.impact('light');
        setPendingFollowIds(prev => new Set(prev).add(targetId));
        try {
            const status = await followUser(targetId);
            if (status === 200) {
                setMyFollowing(prev => {
                    const next = new Set(prev);
                    if (next.has(targetId)) next.delete(targetId);
                    else next.add(targetId);
                    return next;
                });
            }
        } finally {
            setPendingFollowIds(prev => {
                const next = new Set(prev);
                next.delete(targetId);
                return next;
            });
        }
    };

    const isLoadingActive = activeTabState === 'Readers' ? readersLoading : followsLoading;
    const isInitializedActive = activeTabState === 'Readers' ? readersInitialized : followsInitialized;

    const activeData = activeTabState === 'Readers' ? readersData : followsData;
    const filteredData = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return activeData;
        return activeData.filter(u => u.username?.toLowerCase().includes(q));
    }, [activeData, searchQuery]);

    const colors = {
        bg: isDark ? '#0A0410' : '#FFFFFF',
        card: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        cardBorder: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(0,0,0,0.06)',
        text: isDark ? '#FFFFFF' : '#1A1225',
        sub: isDark ? 'rgba(255,255,255,0.55)' : '#64748B',
        accent: isDark ? '#a855f7' : '#7C3AED',
        accentSoft: isDark ? 'rgba(168,85,247,0.15)' : 'rgba(124,58,237,0.10)',
        segmentBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        fieldBg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    };
    const styles = getStyles(colors);

    const renderUserItem = ({ item }: { item: UserData }) => {
        const isMe = myId !== null && item.user_id === myId;
        const isFollowed = myFollowing.has(item.user_id);
        const isPending = pendingFollowIds.has(item.user_id);
        return (
            <TouchableOpacity
                style={styles.userCard}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: "/user-profile", params: { id: item.user_id, last_page: `/follows-screen?userId=${userIdStr}` } })}
            >
                <Image
                    style={styles.avatar}
                    source={{ uri: item.avatar ? `${item.avatar}` : undefined }}
                    contentFit="cover"
                    transition={150}
                />
                <View style={styles.nameCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.userName, { flexShrink: 1 }]} numberOfLines={1}>{item.username}</Text>
                        <UserBadges
                            official={item.official}
                            seekerVerified={item.seeker_verified}
                            isLooped={true}
                            isVisible={true}
                            haveModal={false}
                            isStatic={true}
                            size={16}
                        />
                    </View>
                </View>
                {!isMe && (
                    <TouchableOpacity
                        style={[styles.followBtn, isFollowed ? styles.followBtnMuted : styles.followBtnAccent, isPending && { opacity: 0.6 }]}
                        onPress={() => handleToggleFollow(item.user_id)}
                        disabled={isPending}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.followBtnText, { color: isFollowed ? colors.text : '#FFFFFF' }]}>
                            {isFollowed ? 'Following' : 'Follow'}
                        </Text>
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    const EmptyState = ({ type }: { type: TabKey }) => {
        const config = type === 'Readers' ? {
            icon: Ghost,
            title: searchQuery ? "No matches" : "It's quiet here...",
            subtitle: searchQuery
                ? "No one in this list matches your search."
                : "No followers yet. Share this profile to grow the audience!",
        } : {
            icon: Telescope,
            title: searchQuery ? "No matches" : "Not following anyone yet",
            subtitle: searchQuery
                ? "No one in this list matches your search."
                : "Interesting people they follow will show up here.",
        };
        const IconComponent = config.icon;

        return (
            <View style={styles.emptyContainer}>
                <View style={styles.iconCircle}>
                    <IconComponent size={44} color={colors.accent} style={{ opacity: 0.85 }} />
                </View>
                <Text style={styles.emptyTitle}>{config.title}</Text>
                <Text style={styles.emptySubtitle}>{config.subtitle}</Text>
                {!searchQuery && (
                    <TouchableOpacity style={styles.emptyButton} onPress={onRefresh} activeOpacity={0.8}>
                        <Text style={styles.emptyButtonText}>Refresh</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const showSkeleton = isLoadingActive && !isInitializedActive && activeData.length === 0;

    return (
        <View style={styles.container}>
            <StatusBar
                backgroundColor={colors.bg}
                barStyle={isDark ? "light-content" : "dark-content"}
            />
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.backChip} onPress={() => router.back()} activeOpacity={0.8}>
                    <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.nickname} numberOfLines={1}>{username || 'Profile'}</Text>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.segmentWrap}>
                {TAB_KEYS.map((tab) => {
                    const isActive = activeTabState === tab;
                    return (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.segment, isActive && styles.segmentActive]}
                            onPress={() => handleTabPress(tab)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                                {TAB_LABELS[tab]}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.searchContainer}>
                <Search size={18} color={colors.sub} />
                <TextInput
                    placeholder={`Search ${TAB_LABELS[activeTabState].toLowerCase()}...`}
                    placeholderTextColor={colors.sub}
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                />
            </View>

            <View style={{ flex: 1 }}>
                {showSkeleton ? (
                    <View>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <SkeletonRow key={i} isDark={isDark} opacity={skeletonOpacity} />
                        ))}
                    </View>
                ) : (
                    <FlatList
                        data={filteredData}
                        renderItem={renderUserItem}
                        keyExtractor={item => item.user_id.toString()}
                        onEndReached={activeTabState === 'Readers' ? loadMoreReaders : loadMoreFollows}
                        onEndReachedThreshold={0.5}
                        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                        ListFooterComponent={
                            isLoadingActive && isInitializedActive ?
                                <ActivityIndicator style={styles.footerLoader} size="small" color={colors.accent} />
                                : null
                        }
                        refreshControl={
                            <RefreshControl
                                refreshing={activeTabState === 'Readers' ? readersRefreshing : followsRefreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.text}
                                colors={[colors.accent]}
                                progressBackgroundColor={colors.bg}
                            />
                        }
                        ListEmptyComponent={
                            !isLoadingActive && isInitializedActive && filteredData.length === 0 ? (
                                <EmptyState type={activeTabState} />
                            ) : null
                        }
                    />
                )}
            </View>
        </View>
    );
}

const getStyles = (colors: {
    bg: string; card: string; cardBorder: string; text: string; sub: string;
    accent: string; accentSoft: string; segmentBg: string; fieldBg: string;
}) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    backChip: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
    },
    nickname: {
        flex: 1,
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.text,
        textAlign: 'center',
        marginHorizontal: 8,
    },
    segmentWrap: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 3,
        borderRadius: 14,
        backgroundColor: colors.segmentBg,
    },
    segment: {
        flex: 1,
        paddingVertical: 9,
        alignItems: 'center',
        borderRadius: 11,
    },
    segmentActive: {
        backgroundColor: colors.accent,
    },
    segmentText: {
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.sub,
    },
    segmentTextActive: {
        color: '#FFFFFF',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        paddingHorizontal: 14,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: colors.fieldBg,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        paddingVertical: 0,
        includeFontPadding: false,
        color: colors.text,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 5,
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.segmentBg,
    },
    nameCol: {
        flex: 1,
        marginLeft: 12,
        marginRight: 10,
    },
    userName: {
        fontSize: 15,
        lineHeight: 17,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.text,
    },
    followBtn: {
        minWidth: 92,
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followBtnAccent: {
        backgroundColor: colors.accent,
    },
    followBtnMuted: {
        backgroundColor: colors.segmentBg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    followBtnText: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    footerLoader: {
        paddingVertical: 16,
    },
    emptyContainer: {
        flex: 1,
        paddingTop: 60,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 40,
    },
    iconCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        backgroundColor: colors.accentSoft,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        textAlign: 'center',
        marginBottom: 6,
        color: colors.text,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.sub,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    emptyButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: colors.accentSoft,
    },
    emptyButtonText: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.accent,
    },
});
