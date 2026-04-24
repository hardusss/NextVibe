import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Dimensions,
    useColorScheme,
    Animated,
    RefreshControl,
    ActivityIndicator,
    Pressable,
    Linking,
    Image
} from "react-native";
import Header from "./Header";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import getRecomendatePosts from "@/src/api/get.recomendate.posts";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import { useRouter, useFocusEffect } from "expo-router";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { requestToAttend } from "@/src/api/event.requests";
import { Alert } from 'react-native';
import likePost from "@/src/api/like.post";
import FastImage from 'react-native-fast-image';
import timeAgo from "@/src/utils/formatTime";
import { Platform, UIManager } from 'react-native';
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import { storage } from '@/src/utils/storage';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import VerifyBadge from "../VerifyBadge";
import Hyperlink from "react-native-hyperlink";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import ButtonCollect, { CollectState } from "../NftClaim/ButtonCollect";
import useWalletAddress from "@/hooks/useWalletAddress";
import mintNFT from "@/src/api/mint.nft";
import useTransaction from "@/hooks/useTransaction";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";
import {
    Heart, MessageCircle, MapPin, Volume2, VolumeX,
    Sparkles, Clock, Calendar, Link2
} from "lucide-react-native";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";

const { width: screenWidth } = Dimensions.get("window");

let isSessionActive = false;

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
    background: "white",
    cardBackground: "rgba(255, 255, 255, 1)",
    textPrimary: "#333",
    textSecondary: "#666",
    skeletonBackground: "#e0e0e0",
    skeletonHighlight: "#f5f5f5",
    accentColor: "#0095f6",
    likeColor: "#e91e63",
    shadowColor: "#ccc"
};

const getStyles = (theme: typeof darkTheme) => {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        listContainer: { backgroundColor: theme.background, paddingBottom: 50 },
        postContainer: { borderRadius: 12, padding: 14, position: "relative" },
        postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
        avatar: { width: 40, height: 40, borderRadius: 20 },
        userInfo: { flex: 1, marginLeft: 12  },
        usernameContainer: { flexDirection: "row", alignItems: "center"},
        usernameRow: { flexDirection: "row", alignItems: "center" },
        badgeWrapper: { marginLeft: 1, justifyContent: 'center', alignItems: 'center' },
        username: {
            fontSize: 16, fontFamily: "Dank Mono Bold", includeFontPadding: false,
            color: theme.textPrimary, textAlignVertical: 'center',
        },
        location: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },
        mediaPlaceholder: {
            width: "100%", height: screenWidth, backgroundColor: '#1a1a1a',
            borderRadius: 8, marginBottom: 12, overflow: "hidden"
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
            shadowRadius: 4, elevation: 3, position: "relative"
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
        mediaContainer: { width: screenWidth, height: screenWidth, backgroundColor: '#1a1a1a', overflow: "hidden" },
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
            backgroundColor: theme.background, borderRadius: 12, alignItems: 'center',
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
            backgroundColor: "rgba(0,0,0,0.85)",
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.2)",
        },
        imageBadgeText: {
            color: "#fff",
            fontSize: 11,
            fontFamily: "Dank Mono",
            includeFontPadding: false,
        },
        nftBadge: {
            borderColor: "rgba(168,85,247,0.6)",
            backgroundColor: "rgba(30, 0, 50, 0.85)",
        },
        nftBadgeText: {
            color: "#d8b4fe",
            fontSize: 11,
            fontFamily: "Dank Mono",
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

type VideoStorage =
    | { storage: "cloudinary"; is_video: true }
    | { storage: "r2"; is_video: true }
    | false;

const isVideo = (url: string): VideoStorage => {
    if (url.includes("/video/")) return { storage: "cloudinary", is_video: true };
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    if (videoExtensions.some(ext => url.toLowerCase().endsWith(ext))) return { storage: "r2", is_video: true };
    return false;
};

const getVideoUrls = (mediaItem: MediaItem) => {
    const videoCheck = isVideo(mediaItem.media_url);
    if (!videoCheck) return { preview: mediaItem.media_url, hd: mediaItem.media_url, isVideo: false };
    if (videoCheck.storage === "cloudinary") {
        return {
            preview: mediaItem.media_url.replace('/video/upload/', '/video/upload/q_auto:low,w_400,f_jpg,so_0/'),
            hd: mediaItem.media_url.replace('/video/upload/', '/video/upload/q_auto:good,f_auto,vc_h264:baseline,br_1500k/'),
            isVideo: true,
        };
    }
    return { preview: mediaItem.media_preview || mediaItem.media_url, hd: mediaItem.media_url, isVideo: true };
};

const resolveCollectState = (post: Post): CollectState | null => {
    if (!post.is_nft && !post.is_owner) return null;
    if (post.already_claimed) return "claimed";
    if (post.sold_out) return "soldout";
    return "collect";
};

const PostSkeleton = memo(() => {
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(animatedValue, { toValue: 1, duration: 1000, useNativeDriver: false }),
                Animated.timing(animatedValue, { toValue: 0, duration: 1000, useNativeDriver: false }),
            ])
        ).start();
    }, []);

    const animatedStyle = {
        backgroundColor: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [theme.skeletonBackground, theme.skeletonHighlight],
        }),
    };

    return (
        <View style={styles.skeletonContainer}>
            <View style={styles.skeletonHeader}>
                <Animated.View style={[styles.skeletonAvatar, animatedStyle]} />
                <View style={styles.skeletonInfo}>
                    <Animated.View style={[styles.skeletonUsername, animatedStyle]} />
                    <Animated.View style={[styles.skeletonLocation, animatedStyle]} />
                </View>
            </View>
            <Animated.View style={[styles.mediaPlaceholder, animatedStyle]} />
            <Animated.View style={[styles.skeletonContent, animatedStyle]} />
        </View>
    );
});

const MediaItemComponent = memo(({ item, postId, onLike, isLiked, isVisible, dynamicHeight, isLumaEvent, onMediaSize }: {
    item: MediaItem; postId: number; onLike: (postId: number) => void;
    isLiked: boolean; isVisible: boolean; dynamicHeight?: number;
    isLumaEvent?: boolean;
    onMediaSize?: (width: number, height: number) => void;
}) => {
    const { preview, hd, isVideo: isVideoMedia } = getVideoUrls(item);
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const [isLoading, setIsLoading] = useState<boolean>(isVideoMedia as boolean);
    const [showPreview, setShowPreview] = useState<boolean>(isVideoMedia as boolean);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    const videoRef = useRef<Video>(null);
    const tapCount = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleDoublePress = () => {
        tapCount.current += 1;
        if (tapTimer.current) clearTimeout(tapTimer.current);
        if (tapCount.current === 2) {
            animateHeart();
            if (!isLiked) onLike(postId);
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 300);
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

    useEffect(() => {
        if (!videoRef.current) return;
        if (!isVisible) { videoRef.current.unloadAsync(); setShowPreview(true); }
        return () => { if (videoRef.current) videoRef.current.unloadAsync().catch(() => { }); };
    }, [isVisible, isVideoMedia]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (status.isLoaded && status.isPlaying) { setIsLoading(false); setTimeout(() => setShowPreview(false), 150); }
    };

    return (
        <Pressable onPress={handleDoublePress} style={[styles.mediaContainer, dynamicHeight ? { height: dynamicHeight } : {}]}>
            {isVideoMedia ? (
                <>
                    {(showPreview || !isVisible) && (
                        <FastImage
                            source={{ uri: preview, priority: FastImage.priority.high, cache: FastImage.cacheControl.immutable }}
                            style={styles.previewImage}
                            resizeMode={FastImage.resizeMode.cover}
                        />
                    )}
                    {isVideoMedia && isVisible && (
                        <Video
                            ref={videoRef}
                            style={[styles.fullMedia, dynamicHeight ? { height: dynamicHeight } : {}]}
                            source={{ uri: hd }}
                            resizeMode={ResizeMode.COVER}
                            isLooping isMuted={isMuted} shouldPlay={isVisible}
                            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                        />
                    )}
                    {isLoading && isVisible && (
                        <View style={styles.mediaLoading}>
                            <ActivityIndicator size="large" color="#ffffff" />
                        </View>
                    )}
                    <Pressable
                        onPress={(e) => { e.stopPropagation(); setIsMuted(prev => !prev); }}
                        style={styles.muteButton}
                    >
                        {isMuted
                            ? <VolumeX size={20} color="white" />
                            : <Volume2 size={20} color="white" />
                        }
                    </Pressable>
                </>
            ) : (
                <FastImage
                    source={{ uri: item.media_url, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
                    style={styles.mediaImage}
                    resizeMode={isLumaEvent ? FastImage.resizeMode.contain : FastImage.resizeMode.cover}
                    onLoad={(e) => {
                        if (isLumaEvent && onMediaSize) {
                            const { width, height } = e.nativeEvent;
                            if (width > 0) onMediaSize(width, height);
                        }
                    }}
                />
            )}
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
        <View style={styles.postContainer}>

            {/* ── Header: avatar | username | dots ── */}
            <View style={styles.postHeader}>
               <AvatarWithFrame
                    avatarUrl={item.owner__avatar}
                    size={40}
                    isOg={item.owner__is_og}
                    ogEdition={item.owner__edition}
                    invitedCount={item.owner__invited_count}
                />
                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={styles.userInfo}
                    onPress={() => router.push({ pathname: "/user-profile", params: { id: item.owner__user_id, last_page: "home" } })}
                >
                    <View style={styles.usernameRow}>
                        <Text style={styles.username}>{item.owner__username}</Text>
                        {item.owner__official && (
                            <View style={styles.badgeWrapper}>
                                <VerifyBadge isLooped={true} isVisible={isVisible} haveModal={false} isStatic={false} size={16} />
                            </View>
                        )}
                    </View>
                </TouchableOpacity>

                <View style={{ position: "relative", flexDirection: "row" }}>
                    {collectState !== null && (
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
                        <MaterialCommunityIcons name="dots-vertical" color={theme.textPrimary} size={24} />
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
                            <View style={[styles.imageBadge, { borderColor: "rgba(168,85,247,0.6)", backgroundColor: "rgba(30, 0, 50, 0.85)" }]}>
                                <Calendar size={11} color="#d8b4fe" />
                                <Text style={[styles.imageBadgeText, { color: "#d8b4fe" }]}>Event</Text>
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
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item.id)} style={styles.likesContainer}>
                    <Heart size={22} color={isLiked ? "#A855F7" : theme.textPrimary} fill={isLiked ? "#A855F7" : "transparent"} />
                    <Text style={[styles.likesCount, isLiked && { color: "#A855F7" }]}>{formatNumber(item.count_likes)}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => openComments(item)} style={styles.likesContainer}>
                    <MessageCircle size={22} color={theme.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
            </View>
        </View>
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
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [likedPosts, setLikedPosts] = useState<LikedPosts>({});
    const [showPopup, setShowPopup] = useState(false);
    const [popupPostId, setPopupPostId] = useState<number | null>(null);
    const [popupCommentsEnabled, setPopupCommentsEnabled] = useState<boolean>(true);
    const [visiblePostId, setVisiblePostId] = useState<number | null>(null);
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    const [refreshing, setRefreshing] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
    const [toastMessage, setToastMessage] = useState<string>("Post successfully deleted");
    const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
    const [userID, setUserID] = useState<number>(0);
    const [toastSuccess, setToastSuccess] = useState<boolean>(false);
    const isFetchingRef = useRef(false);

    // Mint 
    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const [mintPostId, setMintPostId] = useState<number>(0);
    const [mintImageUrl, setMintImageUrl] = useState<string | null>(null);
    const [mintCreator, setMintCreator] = useState<string>("");
    const [mintIsOwner, setMintIsOwner] = useState(false);
    const [mintDefaultPrice, setMintDefaultPrice] = useState<string | null>(null);
    const [mintOwnerWallet, setMintOwnerWallet] = useState<string | null>(null);
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
            return;
        }
        if (!mintOwnerWallet) throw new Error("Owner wallet not found");
        const ixs = buildMintPaymentInstructions(address, mintOwnerWallet, price);
        const paymentSignature = await sendInstructions(ixs, "home");
        if (!paymentSignature) throw new Error("Payment was not confirmed");
        await mintNFT(address, postId, price, paymentSignature);
    }, [address, mintIsOwner, mintOwnerWallet, sendInstructions]);

    const getUserID = async () => {
        const id = await storage.getItem("id");
        setUserID(id ? +id : 0);
    };

    const onRefresh = useCallback(() => {
        if (isFetchingRef.current) return;
        setRefreshing(true);
        setHasMore(true);
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
            const newPosts = response.results || [];

            if (newPosts.length === 0) {
                setHasMore(false);
            } else {
                if (loadMore && !reset) setPosts(prev => [...prev, ...newPosts]);
                else setPosts(newPosts);

                if (response.liked_posts) {
                    const newLikes: LikedPosts = {};
                    response.liked_posts.forEach((likedId: number) => { newLikes[likedId] = true; });
                    setLikedPosts(prev => ({ ...prev, ...newLikes }));
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
        fetchPosts(false, true);
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
            setPosts(prev => prev.map(post => 
                post.id === postId ? { ...post, event_request_status: "pending" } : post
            ));
        } catch (e: any) {
            setToastMessage(e.response?.data?.error || "Failed to send request");
            setToastSuccess(false);
            setIsToastVisible(true);
        }
    }, []);

    const toggleLike = useCallback((postId: number) => {
        likePost(postId);
        setLikedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
        setPosts(prev => prev.map(post =>
            post.id === postId
                ? { ...post, count_likes: post.count_likes + (likedPosts[postId] ? -1 : 1) }
                : post
        ));
    }, [likedPosts]);

    const handlePostDeleted = useCallback((postId: number) => {
        setToastMessage("Post successfully deleted");
        setToastSuccess(true);
        setIsToastVisible(true);
        setPosts(prev => prev.filter(p => p.id !== postId));
        setActiveDropdownId(null);
    }, []);

    const openComments = useCallback((item: Post) => {
        setPopupCommentsEnabled(item.is_comments_enabled);
        setPopupPostId(item.id);
        setShowPopup(true);
    }, []);

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 100 }).current;

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
            />
        );
    }, [loading, likedPosts, visiblePostId, userID, theme, styles, activeDropdownId, handleOpenMint, handleRequestToAttend]);

    return (
        <View style={styles.container}>
            <StatusBar backgroundColor={colorScheme === "dark" ? "#0A0410" : "white"} />
            <Web3Toast
                message={toastMessage}
                visible={isToastVisible}
                onHide={() => setIsToastVisible(false)}
                isSuccess={toastSuccess}
            />
            <Header />

            {showPopup && (
                <PopupModal
                    post_id={popupPostId as number}
                    onClose={() => setShowPopup(false)}
                    isCommentsEnabled={popupCommentsEnabled}
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
            />

            <FlatList
                data={dataToRender}
                onScrollBeginDrag={() => setActiveDropdownId(null)}
                keyExtractor={item => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                onEndReached={() => {
                    if (!loading && !loadingMore && hasMore && !isFetchingRef.current) fetchPosts(true);
                }}
                ListEmptyComponent={(
                    <View style={styles.card}>
                        <Text style={styles.cardText}>🎉 No more posts for now</Text>
                        <Text style={styles.cardSub}>Check back later for new vibes!</Text>
                    </View>
                )}
                onEndReachedThreshold={0.5}
                initialNumToRender={2}
                maxToRenderPerBatch={1}
                windowSize={2}
                updateCellsBatchingPeriod={100}
                removeClippedSubviews={true}
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChangedRef.current}
                viewabilityConfig={viewabilityConfig}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListFooterComponent={!loading ? renderFooter : null}
            />
        </View>
    );
}