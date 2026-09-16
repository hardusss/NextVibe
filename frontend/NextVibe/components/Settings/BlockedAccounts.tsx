import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, useColorScheme, StatusBar,
    Animated, FlatList, RefreshControl, ActivityIndicator
} from "react-native";
import { ArrowLeft, Ban } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from "expo-router";
import { Image } from 'expo-image';

import { getBlockedUsers, unblockUser, BlockedUser } from '@/src/api/block';
import { useBlockStore } from '@/src/stores/blockStore';
import UserBadges from '../Shared/UserBadges';
import haptics from '@/src/utils/haptics';

// Same card language as the followers/following screen (ProfilePage/FollowsTab.tsx)
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

export default function BlockedAccounts() {
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const setBlocked = useBlockStore((state) => state.setBlocked);

    const [users, setUsers] = useState<BlockedUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isEnd, setIsEnd] = useState(false);
    const [failed, setFailed] = useState(false);
    const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
    const loadingRef = useRef(false);

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

    const fetchPage = useCallback(async (isRefresh: boolean) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const index = isRefresh ? 0 : users.length;
            const page = await getBlockedUsers(index);
            setUsers(prev => {
                if (isRefresh) return page.data;
                const known = new Set(prev.map(u => u.user_id));
                return [...prev, ...page.data.filter(u => !known.has(u.user_id))];
            });
            setIsEnd(page.end);
            setFailed(false);
        } catch (error) {
            console.error("Failed to fetch blocked accounts:", error);
            if (isRefresh) setFailed(true);
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setInitialized(true);
            if (isRefresh) setRefreshing(false);
        }
    }, [users.length]);

    useEffect(() => {
        fetchPage(true);
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchPage(true);
    }, [fetchPage]);

    const loadMore = useCallback(() => {
        if (initialized && !isEnd && !loadingRef.current) fetchPage(false);
    }, [initialized, isEnd, fetchPage]);

    const handleUnblock = async (userId: number) => {
        if (pendingIds.has(userId)) return;
        setPendingIds(prev => new Set(prev).add(userId));
        try {
            await unblockUser(userId);
            haptics.notification('success');
            setBlocked(userId, false);
            setUsers(prev => prev.filter(u => u.user_id !== userId));
        } catch {
            haptics.notification('error');
        } finally {
            setPendingIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const colors = {
        bg: isDark ? '#0A0410' : '#FFFFFF',
        card: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        cardBorder: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(0,0,0,0.06)',
        text: isDark ? '#FFFFFF' : '#1A1225',
        sub: isDark ? 'rgba(255,255,255,0.55)' : '#64748B',
        accent: isDark ? '#a855f7' : '#7C3AED',
        accentSoft: isDark ? 'rgba(168,85,247,0.15)' : 'rgba(124,58,237,0.10)',
        segmentBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    };
    const styles = getStyles(colors);

    const renderUserItem = ({ item }: { item: BlockedUser }) => {
        const isPending = pendingIds.has(item.user_id);
        return (
            <View style={styles.userCard}>
                <Image
                    style={styles.avatar}
                    source={{ uri: item.avatar ?? undefined }}
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
                <TouchableOpacity
                    style={[styles.unblockBtn, isPending && { opacity: 0.6 }]}
                    onPress={() => handleUnblock(item.user_id)}
                    disabled={isPending}
                    activeOpacity={0.8}
                >
                    <Text style={styles.unblockBtnText}>Unblock</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const showSkeleton = loading && !initialized;

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
                <Text style={styles.title} numberOfLines={1}>Blocked Accounts</Text>
                <View style={{ width: 44 }} />
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
                        data={users}
                        renderItem={renderUserItem}
                        keyExtractor={item => item.user_id.toString()}
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.5}
                        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                        ListFooterComponent={
                            loading && initialized && !refreshing ?
                                <ActivityIndicator style={styles.footerLoader} size="small" color={colors.accent} />
                                : null
                        }
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.text}
                                colors={[colors.accent]}
                                progressBackgroundColor={colors.bg}
                            />
                        }
                        ListEmptyComponent={
                            !loading && initialized ? (
                                <View style={styles.emptyContainer}>
                                    <View style={styles.iconCircle}>
                                        <Ban size={44} color={colors.accent} style={{ opacity: 0.85 }} />
                                    </View>
                                    <Text style={styles.emptyTitle}>
                                        {failed ? "Couldn't load blocked accounts" : "No blocked accounts"}
                                    </Text>
                                    <Text style={styles.emptySubtitle}>
                                        {failed
                                            ? "Check your connection and try again."
                                            : "When you block someone, they'll show up here."}
                                    </Text>
                                    {failed && (
                                        <TouchableOpacity style={styles.emptyButton} onPress={onRefresh} activeOpacity={0.8}>
                                            <Text style={styles.emptyButtonText}>Try again</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
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
    accent: string; accentSoft: string; segmentBg: string;
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
    title: {
        flex: 1,
        fontSize: 18,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.text,
        textAlign: 'center',
        marginHorizontal: 8,
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
    unblockBtn: {
        minWidth: 92,
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.segmentBg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    unblockBtnText: {
        fontSize: 13,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        color: colors.text,
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
