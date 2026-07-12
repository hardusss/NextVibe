import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,

    Dimensions,
    useColorScheme,
    Animated,
    RefreshControl,
    ActivityIndicator,
    Pressable,
    Linking,
} from "react-native";
import Header from "./Header";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import getRecomendatePosts from "@/src/api/get.recomendate.posts";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import { useRouter, useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";

import { requestToAttend } from "@/src/api/event.requests";
import likePost from "@/src/api/like.post";
import { Image } from 'expo-image';
import timeAgo from "@/src/utils/formatTime";
import { Platform, UIManager } from 'react-native';
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import { storage } from '@/src/utils/storage';

import VerifyBadge from "../VerifyBadge";
import Hyperlink from "react-native-hyperlink";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import ButtonCollect, { CollectState } from "../NftClaim/ButtonCollect";
import useWalletAddress from "@/hooks/useWalletAddress";
import mintNFT from "@/src/api/mint.nft";
import useTransaction from "@/hooks/useTransaction";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";
import {
    Heart, MessageCircle, MapPin,
    Sparkles, Clock, Calendar, Link2, MoreVertical
} from "lucide-react-native";
import PhotoModal from "@/components/PostDetails/PhotoModal";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";
import { setFeedFlatListRef } from "@/src/utils/feedScrollRef";
import * as Haptics from 'expo-haptics';
import { ShimmerSkeleton } from '@/components/Shared/motion';
import EmptyState from '@/components/Shared/EmptyState';
import AnimatedReanimated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedScrollHandler,
    withTiming,
    withSpring,
    interpolate,
    Extrapolate,
    runOnJS
} from "react-native-reanimated";
import HomeHeaderTitle from "@/components/Home/HomeHeaderTitle";

const { width: screenWidth } = Dimensions.get("window");

let isSessionActive = false;

// ── Module-level cache to survive tab-switch remounts ──
let cachedPosts: Post[] | null = null;
let cachedLikedPosts: LikedPosts | null = null;
let cachedScrollOffset: number = 0;

export const clearFeedCache = () => {
    cachedPosts = null;
    cachedLikedPosts = null;
    cachedScrollOffset = 0;
    isSessionActive = false;
};

const darkTheme = {
    background: "#0A0410",
    cardBackground: "#0A0410",
    textPrimary: "#E3E3E3",
    textSecondary: "#aaa",
    skeletonBackground: "#1a171f",
    skeletonHighlight: "#444",
    accentColor: "#58a6ff",
    likeColor: "#ff4757",
    shadowColor: "#000"
};

const lightTheme = {
    background: "#FAFAFC",
    cardBackground: "#FFFFFF",
    textPrimary: "#1A1225",
    textSecondary: "#6B5F7A",
    skeletonBackground: "#f1f0f4",
    skeletonHighlight: "#f7f6f9",
    accentColor: "#7c3aed",
    likeColor: "#ef4444",
    shadowColor: "rgba(124, 58, 237, 0.06)"
};

const getStyles = (theme: typeof darkTheme, bottomInset: number = 50, headerHeight: number = 0) => {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        listContainer: {
            backgroundColor: theme.background,
            paddingBottom: bottomInset,
            paddingTop: headerHeight,
        },
        postContainer: {
            borderRadius: 22,
            padding: 18,
            position: "relative",
            backgroundColor: theme.cardBackground,
            marginBottom: 16,
            borderWidth: 1,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderColor: theme.background === "#0A0410" ? "rgba(255, 255, 255, 0.06)" : "rgba(124, 58, 237, 0.08)",
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: theme.background === "#0A0410" ? 0.35 : 0.05,
            shadowRadius: 16,
            elevation: 4,
        },
        postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
        avatar: { width: 40, height: 40, borderRadius: 20 },
        userInfo: { flex: 1, marginLeft: 12 },
        usernameContainer: { flexDirection: "row", alignItems: "center" },
        usernameRow: { flexDirection: "row", alignItems: "center" },
        badgeWrapper: { marginLeft: 1, justifyContent: 'center', alignItems: 'center' },
        username: {
            fontSize: 16, fontFamily: "Dank Mono Bold", includeFontPadding: false,
            color: theme.textPrimary, textAlignVertical: 'center',
        },
        location: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },
        mediaPlaceholder: {
            width: "100%", height: screenWidth, backgroundColor: '#1a1a1a',
            borderRadius: 16, marginBottom: 14, overflow: "hidden"
        },
        mediaImage: { width: "100%", height: "100%" },
        mediaVideo: { width: "100%", height: "100%" },
        mediaLoading: {
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            justifyContent: "center", alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.3)", zIndex: 10
        },
        postContent: { marginBottom: 12 },
        postText: { fontSize: 15, color: theme.textPrimary, lineHeight: 20 },
        postFooter: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "center" },
        likesContainer: { flexDirection: "row", alignItems: "center" },
        likesCount: { marginLeft: 6, color: theme.textPrimary, fontSize: 14 },
        metaRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 10,
            marginBottom: 4,
        },
        metaChip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
        },
        metaText: {
            color: "#666",
            fontSize: 12,
            fontFamily: "Dank Mono",
            includeFontPadding: false,
        },
        loadingMore: { paddingVertical: 16, alignItems: "center" },
        emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 },
        emptyText: { marginTop: 16, fontSize: 16, color: theme.textSecondary },
        skeletonContainer: {
            marginBottom: 16, padding: 14, shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1,
            shadowRadius: 4, elevation: 3, position: "relative",
        },
        skeletonHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
        skeletonAvatar: {
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: theme.skeletonBackground, marginRight: 12
        },
        skeletonInfo: { flex: 1 },
        skeletonUsername: {
            width: 120, height: 16, backgroundColor: theme.skeletonBackground,
            borderRadius: 4, marginBottom: 4
        },
        skeletonLocation: { width: 80, height: 14, backgroundColor: theme.skeletonBackground, borderRadius: 4 },
        skeletonContent: {
            height: 60, backgroundColor: theme.skeletonBackground,
            borderRadius: 4, marginBottom: 12
        },
        skeletonFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        skeletonLikes: { width: 60, height: 16, backgroundColor: theme.skeletonBackground, borderRadius: 4 },
        muteButton: {
            position: "absolute", bottom: 20, right: 40,
            backgroundColor: "rgba(0, 0, 0, 0.6)", padding: 8, borderRadius: 20, zIndex: 20
        },
        pageIndicator: {
            position: "absolute", right: 30, top: 10,
            backgroundColor: "rgba(0, 0, 0, 0.6)", padding: 5, borderRadius: 10
        },
        pageIndicatorText: { color: "white", fontSize: 12 },
        fullMedia: { width: screenWidth, height: screenWidth },
        mediaContainer: { width: screenWidth, height: screenWidth, backgroundColor: '#1a1a1a', overflow: "hidden", borderRadius: 16 },
        heartOverlay: {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'transparent', zIndex: 15
        },
        aiBadge: {
            flexDirection: 'row', alignItems: 'center', backgroundColor: '#05f0d8',
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 8
        },
        aiBadgeText: { color: '#000', fontSize: 10, fontFamily: "Dank Mono Bold", includeFontPadding: false, marginLeft: 2 },
        previewImage: { position: "absolute", width: "100%", height: "100%", zIndex: 5 },
        endOfListText: {
            textAlign: 'center', color: theme.textSecondary,
            padding: 20, paddingBottom: 40, fontSize: 14
        },
        card: {
            margin: 20, marginBottom: 20, padding: 15, paddingBottom: 40,
            backgroundColor: theme.cardBackground, borderRadius: 12, alignItems: 'center',
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 2,
        },
        cardText: { fontSize: 16, fontFamily: "Dank Mono Bold", includeFontPadding: false, color: theme.textPrimary },
        cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
        imageBadges: {
            position: "absolute",
            bottom: 12,
            left: 12,
            flexDirection: "row",
            gap: 6,
            flexWrap: "wrap",
        },
        imageBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: theme.background === "#0A0410" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.9)",
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: theme.background === "#0A0410" ? "rgba(255, 255, 255, 0.12)" : "rgba(124, 58, 237, 0.08)",
        },
        imageBadgeText: {
            color: theme.background === "#0A0410" ? "#fff" : "#1A1225",
            fontSize: 11,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        nftBadge: {
            borderColor: "rgba(168,85,247,0.3)",
            backgroundColor: theme.background === "#0A0410" ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.1)",
        },
        nftBadgeText: {
            color: "#A855F7",
            fontSize: 11,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
    });
}

interface MediaItem {
    id: number;
    media_url: string;
    media_preview: string | null;
    type: "image" | "video";
}

interface Post {
    id: number;
    about: string;
    create_at: string;
    location: string;
    count_likes: number;
    is_comments_enabled: boolean;
    owner__user_id: number;
    owner__username: string;
    owner__avatar: string;
    owner__official: boolean;
    owner__is_og: boolean;
    owner__edition: number | null;
    owner__invited_count: number;
    media: MediaItem[];
    is_ai_generated: boolean;
    moderation_status: string;
    // NFT
    is_nft: boolean;
    nft_price: string | null;
    is_owner: boolean;
    already_claimed: boolean;
    sold_out: boolean;
    minted_count: number;
    total_supply: number;
    owner_wallet: string | null;
    is_luma_event?: boolean;
    luma_event_url?: string;
    luma_event_verified?: boolean;
    luma_event_start_time?: string;
    luma_event_end_time?: string;
    event_request_status?: "pending" | "approved" | "rejected" | null;
}

const formatEventDate = (isoString: string): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface LikedPosts { [key: number]: boolean; }

const getVideoUrls = (mediaItem: MediaItem) => ({
    preview: mediaItem.media_url,
    hd: mediaItem.media_url,
    isVideo: false as false,
});

const resolveCollectState = (post: Post): CollectState | null => {
    if (!post.is_nft && !post.is_owner) return null;
    if (post.already_claimed) return "claimed";
    if (post.sold_out) return "soldout";
    return "collect";
};

const PostSkeleton = memo(() => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
    const theme = isDark ? darkTheme : lightTheme;
    const styles = getStyles(theme);

    return (
        <View style={styles.skeletonContainer}>
            <View style={styles.skeletonHeader}>
                <ShimmerSkeleton width={40} height={40} borderRadius={20} isDark={isDark} />
                <View style={styles.skeletonInfo}>
                    <ShimmerSkeleton width={120} height={14} borderRadius={4} isDark={isDark} style={{ marginBottom: 6 }} />
                    <ShimmerSkeleton width={80} height={10} borderRadius={3} isDark={isDark} />
                </View>
            </View>
            <ShimmerSkeleton width="100%" height={250} borderRadius={12} isDark={isDark} style={{ marginBottom: 12 }} />
            <ShimmerSkeleton width="90%" height={16} borderRadius={4} isDark={isDark} />
        </View>
    );
});

const MediaItemComponent = memo(({ item, postId, onLike, isLiked, isVisible, dynamicHeight, isLumaEvent, onMediaSize, onImagePress }: {
    item: MediaItem; postId: number; onLike: (postId: number) => void;
    isLiked: boolean; isVisible: boolean; dynamicHeight?: number;
    isLumaEvent?: boolean;
    onMediaSize?: (width: number, height: number) => void;
    onImagePress?: () => void;
}) => {
    const { preview } = getVideoUrls(item);
    const [showHeart, setShowHeart] = useState(false);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const dimAnim = useRef(new Animated.Value(0)).current;
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    const tapCount = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const animateTapAndOpen = useCallback(() => {
        // Brief dim flash then open modal
        Animated.sequence([
            Animated.timing(dimAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
            Animated.timing(dimAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => {
            onImagePress?.();
        });
    }, [onImagePress, dimAnim]);

    const handleDoublePress = () => {
        tapCount.current += 1;
        if (tapTimer.current) clearTimeout(tapTimer.current);
        if (tapCount.current === 2) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            animateHeart();
            if (!isLiked) onLike(postId);
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => {
                if (tapCount.current === 1 && onImagePress) {
                    animateTapAndOpen();
                }
                tapCount.current = 0;
            }, 300);
        }
    };

    useEffect(() => {
        return () => { if (tapTimer.current) clearTimeout(tapTimer.current); };
    }, []);

    const animateHeart = () => {
        setShowHeart(true);
        Animated.sequence([
            Animated.spring(heartAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
            Animated.delay(500),
            Animated.timing(heartAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => { setShowHeart(false); heartAnim.setValue(0); });
    };


    return (
        <Pressable onPress={handleDoublePress} style={[styles.mediaContainer, dynamicHeight ? { height: dynamicHeight } : {}]}>
            <Image
                source={{ uri: preview }}
                style={styles.mediaImage}
                contentFit={isLumaEvent ? "contain" : "cover"}
                onLoad={(e) => {
                    if (isLumaEvent && onMediaSize) {
                        const { width, height } = e.source;
                        if (width > 0) onMediaSize(width, height);
                    }
                }}
            />
            {/* Dim overlay on image tap */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: 8,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    opacity: dimAnim,
                }}
            />
            {showHeart && (
                <Animated.View
                    style={[styles.heartOverlay, { transform: [{ scale: heartAnim }], opacity: heartAnim }]}
                    pointerEvents="none"
                >
                    <Heart size={80} color="#A855F7" fill="#A855F7" />
                </Animated.View>
            )}
        </Pressable>
    );
}, (prev, next) =>
    prev.isVisible === next.isVisible &&
    prev.isLiked === next.isLiked &&
    prev.item.id === next.item.id
);

const PostItem = memo(({
    item, isLiked, isVisible, userID, theme, styles, router,
    toggleLike, onDelete, openComments, dropdownVisible, setDropdownVisible,
    setToastMessage, setToastSuccess, setIsToastVisible,
    onOpenMint,
    handleRequestToAttend,
    onOpenPhotoModal,
}: any) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [eventImageHeight, setEventImageHeight] = useState<number | null>(null);

    const handleMediaSize = useCallback((width: number, height: number) => {
        if (width > 0) setEventImageHeight((screenWidth / width) * height);
    }, []);

    const needsMoreButton = item.about?.length > 100;
    const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
    const mediaItems = item.media || [];
    const hasMedia = mediaItems.length > 0;

    const collectState = resolveCollectState(item);
    const supplyLabel = `${item.minted_count ?? 0}/${item.total_supply ?? 50}`;

    return (
        <TouchableOpacity style={styles.postContainer} onPress={() => {
            router.push({
                pathname: "/post-details", params: {
                    id: item.id,
                    postContent: item.text,
                    postImageUrl: item.image
                }
            });
        }} activeOpacity={0.8}>

            {/* ── Header: avatar | username | dots ── */}
            <View style={styles.postHeader}>
                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    onPress={() => router.push({ pathname: "/user-profile", params: { id: item.owner__user_id, last_page: "home" } })}
                >
                    <AvatarWithFrame
                        avatarUrl={item.owner__avatar}
                        size={40}
                        isOg={item.owner__is_og}
                        ogEdition={item.owner__edition}
                        invitedCount={item.owner__invited_count}
                    />
                </TouchableOpacity>
                <View style={styles.userInfo}>
                    <View style={styles.usernameRow}>
                        <Text style={styles.username}>{item.owner__username}</Text>
                        {item.owner__official && (
                            <View style={styles.badgeWrapper}>
                                <VerifyBadge isLooped={true} isVisible={isVisible} haveModal={false} isStatic={false} size={16} />
                            </View>
                        )}
                    </View>
                </View>


                <View style={{ position: "relative", flexDirection: "row" }}>
                    {collectState !== null && !item?.is_luma_event && (
                        <ButtonCollect
                            onPress={() => onOpenMint(item)}
                            state={collectState}
                            supplyLabel={supplyLabel}
                        />
                    )}
                    <TouchableOpacity
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        style={{ padding: 5 }}
                        onPress={(e) => { e.stopPropagation(); setDropdownVisible(item.id); }}
                    >
                        <MoreVertical color={theme.textPrimary} size={24} />
                    </TouchableOpacity>
                    <DropDown
                        isVisible={dropdownVisible}
                        isOwner={userID === item.owner__user_id}
                        postId={item.id}
                        onClose={() => setDropdownVisible(null)}
                        onPostDeleted={() => onDelete(item.id)}
                        onPostDeletedFail={() => {
                            setToastMessage("Error deleting post");
                            setToastSuccess(false);
                            setIsToastVisible(true);
                        }}
                        onReportResult={(reported?: boolean, message?: string) => {
                            setDropdownVisible(null);
                            setTimeout(() => {
                                if (message) { setToastMessage(message); setToastSuccess(false); setIsToastVisible(true); }
                                else if (reported) { setToastSuccess(true); setToastMessage('Report submitted'); setIsToastVisible(true); }
                            }, 260);
                        }}
                    />
                </View>
            </View>

            {/* ── Media ── */}
            {hasMedia && (
                <View style={[
                    styles.mediaPlaceholder,
                    eventImageHeight ? { height: eventImageHeight } : {},
                    item.is_luma_event ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}
                ]}>
                    {mediaItems.length > 1 ? (
                        <View style={{ width: screenWidth, height: eventImageHeight || screenWidth, position: "relative" }}>
                            <FlatList
                                data={mediaItems}
                                renderItem={({ item: mediaItem, index: mediaIndex }) => (
                                    <MediaItemComponent
                                        item={mediaItem} postId={item.id} onLike={toggleLike}
                                        isLiked={isLiked} isVisible={isVisible && currentMediaIndex === mediaIndex}
                                        dynamicHeight={eventImageHeight || undefined}
                                        isLumaEvent={item.is_luma_event}
                                        onMediaSize={handleMediaSize}
                                        onImagePress={() => onOpenPhotoModal(item.media, mediaIndex)}
                                    />
                                )}
                                keyExtractor={mediaItem => mediaItem.id.toString()}
                                horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(event) => {
                                    setCurrentMediaIndex(Math.round(event.nativeEvent.contentOffset.x / screenWidth));
                                }}
                                updateCellsBatchingPeriod={100} removeClippedSubviews={true}
                                scrollEventThrottle={16} initialNumToRender={1} maxToRenderPerBatch={1} windowSize={2}
                            />
                            <View style={styles.pageIndicator}>
                                <Text style={styles.pageIndicatorText}>{currentMediaIndex + 1}/{mediaItems.length}</Text>
                            </View>
                        </View>
                    ) : (
                        <MediaItemComponent
                            item={mediaItems[0]} postId={item.id} onLike={toggleLike}
                            isLiked={isLiked} isVisible={isVisible}
                            dynamicHeight={eventImageHeight || undefined}
                            isLumaEvent={item.is_luma_event}
                            onMediaSize={handleMediaSize}
                            onImagePress={() => onOpenPhotoModal(item.media, 0)}
                        />
                    )}

                    {/* Overlay badges */}
                    <View style={styles.imageBadges} pointerEvents="none">
                        {item.is_ai_generated && (
                            <View style={styles.imageBadge}>
                                <Sparkles size={11} color="#05f0d8" />
                                <Text style={styles.imageBadgeText}>AI</Text>
                            </View>
                        )}
                        {item.is_luma_event && (
                            <View style={[
                                styles.imageBadge,
                                {
                                    borderColor: theme.background === "#0A0410" ? "rgba(168,85,247,0.4)" : "rgba(168,85,247,0.3)",
                                    backgroundColor: theme.background === "#0A0410" ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.1)"
                                }
                            ]}>
                                <Calendar size={11} color="#A855F7" />
                                <Text style={[styles.imageBadgeText, { color: "#A855F7" }]}>Event</Text>
                            </View>
                        )}
                        {item.is_nft && (
                            <View style={[styles.imageBadge, styles.nftBadge]}>
                                <Text style={styles.nftBadgeText}>{item.minted_count}/{item.total_supply} minted</Text>
                            </View>
                        )}
                        {item.location && (
                            <View style={styles.imageBadge}>
                                <MapPin size={11} color="#fff" />
                                <Text style={styles.imageBadgeText}>{item.location}</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* ── Meta chips: date + comments on ── */}
            <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                    <Clock size={12} color="#666" />
                    <Text style={styles.metaText}>{timeAgo(item.create_at)}</Text>
                </View>
                {item.is_comments_enabled && (
                    <View style={styles.metaChip}>
                        <MessageCircle size={12} color="#666" />
                        <Text style={styles.metaText}>Comments on</Text>
                    </View>
                )}
            </View>

            {/* ── About text ── */}
            {displayText && (
                <View style={styles.postContent}>
                    <Hyperlink linkStyle={{ color: "#A78BFA" }} onPress={(url: string) => Linking.openURL(url)}>
                        <Text style={styles.postText}>{displayText}</Text>
                    </Hyperlink>
                    {needsMoreButton && (
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => setIsExpanded(!isExpanded)}>
                            <Text style={{ color: theme.accentColor, marginTop: 5 }}>
                                {isExpanded ? "Show less" : "Read more"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {item.is_luma_event && item.luma_event_url && (
                <View style={{ marginBottom: 12, padding: 14, backgroundColor: "rgba(168,85,247,0.1)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(168,85,247,0.2)" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            {item.luma_event_start_time && (
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                                    <Calendar size={16} color="#d8b4fe" style={{ flexShrink: 0, marginTop: 2 }} />
                                    <Text style={{ color: "#d8b4fe", fontSize: 13, fontFamily: "Dank Mono Bold", flexShrink: 1, lineHeight: 20 }}>
                                        {formatEventDate(item.luma_event_start_time)}
                                        {item.luma_event_end_time ? ` → ${formatEventDate(item.luma_event_end_time)}` : ""}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {(() => {
                            const dateToCheck = item.luma_event_end_time || item.luma_event_start_time;
                            const isEnded = dateToCheck ? new Date(dateToCheck) < new Date() : false;
                            return (
                                <View style={{ backgroundColor: isEnded ? "rgba(255,255,255,0.1)" : "rgba(5,240,216,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexShrink: 0 }}>
                                    <Text style={{ color: isEnded ? "#999" : "#05f0d8", fontSize: 11, fontFamily: "Dank Mono Bold" }}>
                                        {isEnded ? "Ended" : "Active"}
                                    </Text>
                                </View>
                            );
                        })()}
                    </View>

                    {(() => {
                        const dateToCheck = item.luma_event_end_time || item.luma_event_start_time;
                        const isEnded = dateToCheck ? new Date(dateToCheck) < new Date() : false;
                        const isApproved = item.event_request_status === "approved";
                        const isPending = item.event_request_status === "pending";
                        const isRejected = item.event_request_status === "rejected";
                        const isOwner = item.owner__user_id === userID;
                        const canViewLuma = isOwner || isEnded || isApproved;

                        if (isApproved && !isOwner) {
                            return (
                                <View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(34,197,94,0.12)", padding: 10, borderRadius: 8, justifyContent: "center", marginTop: 4 }}>
                                        <Text style={{ color: "#4ade80", fontSize: 14, fontFamily: "Dank Mono Bold" }}>✓ You are going</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => Linking.openURL(item.luma_event_url!)}
                                        style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(168,85,247,0.2)", padding: 10, borderRadius: 8, justifyContent: "center", marginTop: 8 }}
                                    >
                                        <Link2 size={16} color="#d8b4fe" />
                                        <Text style={{ color: "#d8b4fe", fontSize: 14, fontFamily: "Dank Mono Bold" }}>View Event on Luma</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        }

                        const btnBg = isRejected ? "rgba(239,68,68,0.2)" : "rgba(168,85,247,0.2)";
                        const btnOpacity = (isPending || isRejected) ? 0.7 : 1;
                        const iconColor = isRejected ? "#ef4444" : "#d8b4fe";
                        const btnLabel = canViewLuma
                            ? "View Event on Luma"
                            : isPending ? "Requested"
                                : isRejected ? "Request Denied"
                                    : "Request to Attend";
                        const labelColor = isRejected ? "#ef4444" : "#d8b4fe";

                        return (
                            <TouchableOpacity
                                disabled={isPending || isRejected}
                                onPress={() => {
                                    if (canViewLuma) Linking.openURL(item.luma_event_url!);
                                    else handleRequestToAttend(item.id);
                                }}
                                style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: btnBg, padding: 10, borderRadius: 8, justifyContent: "center", marginTop: 4, opacity: btnOpacity }}
                            >
                                <Link2 size={16} color={iconColor} />
                                <Text style={{ color: labelColor, fontSize: 14, fontFamily: "Dank Mono Bold" }}>{btnLabel}</Text>
                            </TouchableOpacity>
                        );
                    })()}

                </View>
            )}

            {/* ── Footer: like | comment | spacer | ButtonCollect ── */}
            <View style={styles.postFooter}>
                <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item.id)} style={styles.likesContainer}>
                    <Heart size={22} color={isLiked ? "#A855F7" : theme.textPrimary} fill={isLiked ? "#A855F7" : "transparent"} />
                    <Text style={[styles.likesCount, isLiked && { color: "#A855F7" }]}>{formatNumber(item.count_likes)}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => openComments(item)} style={styles.likesContainer}>
                    <MessageCircle size={22} color={theme.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
            </View>
        </TouchableOpacity>
    );
}, (prev, next) => {
    if (prev.item.id !== next.item.id) return false;
    if (prev.isLiked !== next.isLiked) return false;
    if (prev.isVisible !== next.isVisible) return false;
    if (prev.dropdownVisible !== next.dropdownVisible) return false;
    if (prev.item.count_likes !== next.item.count_likes) return false;
    if (prev.item.media?.length !== next.item.media?.length) return false;
    if (prev.item.about !== next.item.about) return false;
    if (prev.item.already_claimed !== next.item.already_claimed) return false;
    if (prev.item.minted_count !== next.item.minted_count) return false;
    if (prev.item.owner__is_og !== next.item.owner__is_og) return false;
    if (prev.item.owner__invited_count !== next.item.owner__invited_count) return false;
    if (prev.item.event_request_status !== next.item.event_request_status) return false;
    return true;
});

export default function MainPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const headerHeight = insets.top + 46;
    const translateY = useSharedValue(0);
    const lastScrollY = useSharedValue(0);

    const updateCache = (y: number) => {
        cachedScrollOffset = Math.max(0, y);
    };

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            const currentY = event.contentOffset.y;
            const diff = currentY - lastScrollY.value;

            if (currentY <= 0) {
                translateY.value = withTiming(0, { duration: 100 });
            } else {
                const nextVal = translateY.value - diff;
                translateY.value = Math.max(-headerHeight, Math.min(0, nextVal));
            }
            lastScrollY.value = currentY;
            runOnJS(updateCache)(currentY);
        },
        onEndDrag: (event) => {
            const currentY = event.contentOffset.y;
            if (currentY > headerHeight) {
                if (translateY.value < -headerHeight / 2) {
                    translateY.value = withSpring(-headerHeight, { damping: 20, stiffness: 120 });
                } else {
                    translateY.value = withSpring(0, { damping: 20, stiffness: 120 });
                }
            } else {
                translateY.value = withSpring(0, { damping: 20, stiffness: 120 });
            }
        }
    });

    const animatedHeaderStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            translateY.value,
            [-headerHeight, 0],
            [0, 1],
            Extrapolate.CLAMP
        );
        return {
            transform: [{ translateY: translateY.value }],
            opacity,
        };
    });

    const isFocused = useIsFocused();
    const hasCached = cachedPosts !== null && cachedPosts.length > 0;
    const [posts, setPosts] = useState<Post[]>(cachedPosts ?? []);
    const [loading, setLoading] = useState(!hasCached);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [likedPosts, setLikedPosts] = useState<LikedPosts>(cachedLikedPosts ?? {});
    const [showPopup, setShowPopup] = useState(false);
    const [popupPostId, setPopupPostId] = useState<number | null>(null);
    const [popupCommentsEnabled, setPopupCommentsEnabled] = useState<boolean>(true);
    const [visiblePostId, setVisiblePostId] = useState<number | null>(null);
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme, insets.bottom > 0 ? insets.bottom + 100 : 110, headerHeight);
    const [refreshing, setRefreshing] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string>("Post successfully deleted");
    const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
    const [userID, setUserID] = useState<number>(0);
    const [toastSuccess, setToastSuccess] = useState<boolean>(false);
    const isFetchingRef = useRef(false);
    const flatListRef = useRef<FlatList>(null);
    const pendingScrollRestore = useRef(hasCached && cachedScrollOffset > 0);

    // Sync the module-level ref so external callers (tab bar) can scroll-to-top
    useEffect(() => {
        return () => { setFeedFlatListRef(null); };
    }, []);

    // Mint 
    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const [mintPostId, setMintPostId] = useState<number>(0);
    const [mintImageUrl, setMintImageUrl] = useState<string | null>(null);
    const [mintCreator, setMintCreator] = useState<string>("");
    const [mintIsOwner, setMintIsOwner] = useState(false);
    const [mintDefaultPrice, setMintDefaultPrice] = useState<string | null>(null);
    const [mintOwnerWallet, setMintOwnerWallet] = useState<string | null>(null);

    useEffect(() => {
        if (!isFocused) {
            const checkLogout = async () => {
                const storedId = await storage.getItem("id");
                if (!storedId) {
                    setShowPopup(false);
                    setPopupPostId(null);
                    setMintPostId(0);
                    mintSheetRef.current?.dismiss();
                }
            };
            checkLogout();
        }
    }, [isFocused]);

    // Photo Modal
    const [photoModalVisible, setPhotoModalVisible] = useState(false);
    const [photoModalIndex, setPhotoModalIndex] = useState(0);
    const [photoModalMedia, setPhotoModalMedia] = useState<MediaItem[]>([]);

    const { address } = useWalletAddress();
    const { sendInstructions } = useTransaction();

    const handleOpenMint = useCallback((post: Post) => {
        setMintPostId(post.id);
        setMintImageUrl(post.media?.[0]?.media_url ?? null);
        setMintCreator(post.owner__username);
        setMintIsOwner(post.is_owner);
        setMintDefaultPrice(post.nft_price);
        setMintOwnerWallet(post.owner_wallet);
        setTimeout(() => mintSheetRef.current?.present(), 50);
    }, []);

    const handleMint = useCallback(async (postId: number, price: number) => {
        if (!address) throw new Error("Wallet not connected");
        if (mintIsOwner) {
            await mintNFT(address, postId, price);
        } else {
            if (!mintOwnerWallet) throw new Error("Owner wallet not found");
            const ixs = buildMintPaymentInstructions(address, mintOwnerWallet, price);
            const paymentSignature = await sendInstructions(ixs, "home");
            if (!paymentSignature) throw new Error("Payment was not confirmed");
            await mintNFT(address, postId, price, paymentSignature);
        }
        // Update local state so the Collect button switches to "Collected"
        setPosts(prev => prev.map(p =>
            p.id === postId
                ? { ...p, already_claimed: true, minted_count: (p.minted_count ?? 0) + 1 }
                : p
        ));
    }, [address, mintIsOwner, mintOwnerWallet, sendInstructions]);

    const getUserID = async () => {
        const id = await storage.getItem("id");
        setUserID(id ? +id : 0);
    };

    const onRefresh = useCallback(() => {
        if (isFetchingRef.current) return;
        setRefreshing(true);
        setHasMore(true);
        cachedScrollOffset = 0;
        fetchPosts(false, true, true).then(() => setRefreshing(false));
    }, []);

    const fetchPosts = async (loadMore = false, reset = false, forceReset = false) => {
        if (isFetchingRef.current) return;
        if (!reset && loadMore && !hasMore) return;

        isFetchingRef.current = true;
        const shouldReset = forceReset || !isSessionActive;
        if (shouldReset) isSessionActive = true;

        if (loadMore) setLoadingMore(true);
        else if (!reset) setLoading(true);

        try {
            const response = await getRecomendatePosts(shouldReset);
            if (!response) return;
            const newPosts = response.results || [];

            if (newPosts.length === 0) {
                setHasMore(false);
            } else {
                if (loadMore && !reset) {
                    setPosts(prev => {
                        const updated = [...prev, ...newPosts];
                        cachedPosts = updated;
                        return updated;
                    });
                } else {
                    setPosts(newPosts);
                    cachedPosts = newPosts;
                }

                if (response.liked_posts) {
                    const newLikes: LikedPosts = {};
                    response.liked_posts.forEach((likedId: number) => { newLikes[likedId] = true; });
                    setLikedPosts(prev => {
                        const updated = { ...prev, ...newLikes };
                        cachedLikedPosts = updated;
                        return updated;
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setTimeout(() => { isFetchingRef.current = false; }, 500);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
        getUserID();
        // Skip fetch if we already have cached data (tab-switch remount)
        if (!hasCached) {
            fetchPosts(false, true);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            return () => { setVisiblePostId(null); };
        }, [])
    );

    const handleRequestToAttend = useCallback(async (postId: number) => {
        try {
            await requestToAttend(postId);
            setToastMessage("Your request to attend has been sent!");
            setToastSuccess(true);
            setIsToastVisible(true);
            setPosts(prev => {
                const updated = prev.map(post =>
                    post.id === postId ? { ...post, event_request_status: "pending" as const } : post
                );
                cachedPosts = updated;
                return updated;
            });
        } catch (e: any) {
            setToastMessage(e.response?.data?.error || "Failed to send request");
            setToastSuccess(false);
            setIsToastVisible(true);
        }
    }, []);

    const toggleLike = useCallback((postId: number) => {
        likePost(postId);
        setLikedPosts(prev => {
            const updated = { ...prev, [postId]: !prev[postId] };
            cachedLikedPosts = updated;
            return updated;
        });
        setPosts(prev => {
            const updated = prev.map(post =>
                post.id === postId
                    ? { ...post, count_likes: post.count_likes + (likedPosts[postId] ? -1 : 1) }
                    : post
            );
            cachedPosts = updated;
            return updated;
        });
    }, [likedPosts]);

    const handlePostDeleted = useCallback((postId: number) => {
        setToastMessage("Post successfully deleted");
        setToastSuccess(true);
        setIsToastVisible(true);
        setPosts(prev => {
            const updated = prev.filter(p => p.id !== postId);
            cachedPosts = updated;
            return updated;
        });
        setActiveDropdownId(null);
    }, []);

    const openComments = useCallback((item: Post) => {
        setPopupCommentsEnabled(item.is_comments_enabled);
        setPopupPostId(item.id);
        setShowPopup(true);
    }, []);

    const handleOpenPhotoModal = useCallback((media: MediaItem[], index: number) => {
        setPhotoModalMedia(media);
        setPhotoModalIndex(index);
        setPhotoModalVisible(true);
    }, []);

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 300 }).current;

    const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            const mostVisible = viewableItems.reduce(
                (prev, cur) => (cur.isViewable && (!prev || cur.index < prev.index)) ? cur : prev, null
            );
            if (mostVisible?.item) setVisiblePostId(mostVisible.item.id);
        } else {
            setVisiblePostId(null);
        }
    });

    const renderFooter = () => {
        if (loadingMore) return <View style={styles.loadingMore}><CustomActivityIndicator size="small" color="#58a6ff" /></View>;
        if (!hasMore && posts.length > 0) {
            return (
                <View style={styles.card}>
                    <Text style={styles.cardText}>🎉 No more posts for now</Text>
                    <Text style={styles.cardSub}>Check back later for new vibes!</Text>
                </View>
            );
        }
        return <View style={{ height: 20 }} />;
    };

    const dataToRender = loading
        ? Array.from({ length: 2 }).map((_, i) => ({ id: `skeleton-${i}`, type: 'skeleton' }))
        : posts.filter(p => p.moderation_status === "approved");

    const renderItem = useCallback(({ item }: { item: any }) => {
        if (loading || item.type === 'skeleton') return <PostSkeleton />;
        return (
            <PostItem
                item={item}
                isLiked={!!likedPosts[item.id]}
                isVisible={visiblePostId === item.id}
                userID={userID}
                theme={theme}
                styles={styles}
                router={router}
                toggleLike={toggleLike}
                onDelete={handlePostDeleted}
                openComments={openComments}
                dropdownVisible={activeDropdownId === item.id}
                setDropdownVisible={(id: number | null) => setActiveDropdownId(prev => (id === null || prev === id) ? null : id)}
                setToastMessage={setToastMessage}
                setToastSuccess={setToastSuccess}
                setIsToastVisible={setIsToastVisible}
                onOpenMint={handleOpenMint}
                handleRequestToAttend={handleRequestToAttend}
                onOpenPhotoModal={handleOpenPhotoModal}
            />
        );
    }, [loading, likedPosts, visiblePostId, userID, theme, styles, activeDropdownId, handleOpenMint, handleRequestToAttend]);

    return (
        <View style={styles.container}>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            <Web3Toast
                message={toastMessage}
                visible={isToastVisible}
                onHide={() => setIsToastVisible(false)}
                isSuccess={toastSuccess}
            />
            <PhotoModal
                visible={photoModalVisible}
                images={photoModalMedia}
                initialIndex={photoModalIndex}
                onClose={() => setPhotoModalVisible(false)}
            />
            {showPopup && (
                <PopupModal
                    post_id={popupPostId as number}
                    onClose={() => setShowPopup(false)}
                    isCommentsEnabled={popupCommentsEnabled}
                    isFocused={isFocused}
                />
            )}

            <MintBottomSheet
                ref={mintSheetRef}
                postId={mintPostId}
                imageUrl={mintImageUrl}
                creatorUsername={mintCreator}
                walletConnected={!!address}
                onMint={handleMint}
                isOwner={mintIsOwner}
                defaultPrice={mintDefaultPrice}
                page="home"
                isFocused={isFocused}
            />

            <AnimatedReanimated.FlatList
                ref={(ref) => {
                    (flatListRef as any).current = ref;
                    setFeedFlatListRef(ref as any);
                }}
                data={dataToRender}
                onScroll={scrollHandler}
                onContentSizeChange={(_w, contentHeight) => {
                    // Restore scroll once enough content has been rendered
                    if (pendingScrollRestore.current && contentHeight >= cachedScrollOffset) {
                        pendingScrollRestore.current = false;
                        flatListRef.current?.scrollToOffset({ offset: cachedScrollOffset, animated: false });
                    }
                }}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => setActiveDropdownId(null)}
                keyExtractor={item => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                onEndReached={() => {
                    if (!loading && !loadingMore && hasMore && !isFetchingRef.current) fetchPosts(true);
                }}
                ListEmptyComponent={
                    <EmptyState
                        title="No more posts for now"
                        subtitle="Check back later for new vibes!"
                        animation="error"
                    />
                }
                onEndReachedThreshold={0.5}
                initialNumToRender={pendingScrollRestore.current ? 10 : 3}
                maxToRenderPerBatch={pendingScrollRestore.current ? 5 : 3}
                windowSize={pendingScrollRestore.current ? 5 : 5}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={Platform.OS === 'android'}
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChangedRef.current}
                viewabilityConfig={viewabilityConfig}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        progressViewOffset={headerHeight}
                    />
                }
                ListFooterComponent={!loading ? renderFooter : null}
            />

            <AnimatedReanimated.View style={[
                {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    height: headerHeight,
                    paddingTop: insets.top,
                    paddingLeft: 16,
                    backgroundColor: "transparent",
                },
                animatedHeaderStyle
            ]}>
                <HomeHeaderTitle />
            </AnimatedReanimated.View>
        </View>
    );
}