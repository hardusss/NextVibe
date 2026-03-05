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
    Linking
} from "react-native";
import Header from "./Header";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import getRecomendatePosts from "@/src/api/get.recomendate.posts";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter, useFocusEffect } from "expo-router";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
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

const { width: screenWidth } = Dimensions.get("window");

let isSessionActive = false;

// --- THEME & STYLES ---
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
        container: {
            flex: 1,
            backgroundColor: theme.background
        },
        listContainer: {
            backgroundColor: theme.background,
            paddingBottom: 50
        },
        postContainer: {
            borderRadius: 12,
            padding: 14,
            position: "relative"
        },
        postHeader: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12
        },
        avatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            marginRight: 12
        },
        userInfo: {
            flex: 1
        },
        usernameContainer: {
            flexDirection: "row",
            alignItems: "center"
        },
        usernameRow: {
            flexDirection: "row",
            alignItems: "center", 
        },
        badgeWrapper: {
            marginLeft: 1, 
            justifyContent: 'center',
            alignItems: 'center',
        },
        username: {
            fontSize: 16,
            fontFamily: "Dank Mono Bold",
    includeFontPadding: false,
            color: theme.textPrimary,
            includeFontPadding: false, 
            textAlignVertical: 'center',
        },
        location: {
            fontSize: 14,
            color: theme.textSecondary,
            marginTop: 2
        },
        mediaPlaceholder: {
            width: "100%",
            height: screenWidth,
            backgroundColor: '#1a1a1a',
            borderRadius: 8,
            marginBottom: 12,
            overflow: "hidden"
        },
        mediaImage: {
            width: "100%",
            height: "100%"
        },
        mediaVideo: {
            width: "100%",
            height: "100%"
        },
        mediaLoading: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            zIndex: 10
        },
        postContent: {
            marginBottom: 12
        },
        postText: {
            fontSize: 15,
            color: theme.textPrimary,
            lineHeight: 20
        },
        postFooter: {
            marginLeft: -1,
            flexDirection: "row",
            gap: 10,
            alignItems: "center"
        },
        likesContainer: {
            flexDirection: "row",
            alignItems: "center"
        },
        likesCount: {
            marginLeft: 6,
            color: theme.textPrimary,
            fontSize: 14
        },
        postDate: {
            color: theme.textSecondary,
            fontSize: 14,
            position: "absolute",
            bottom: 20,
            right: 15
        },
        loadingMore: {
            paddingVertical: 16,
            alignItems: "center"
        },
        emptyContainer: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 32
        },
        emptyText: {
            marginTop: 16,
            fontSize: 16,
            color: theme.textSecondary
        },
        skeletonContainer: {
            marginBottom: 16,
            padding: 14,
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
            position: "relative"
        },
        skeletonHeader: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12
        },
        skeletonAvatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.skeletonBackground,
            marginRight: 12
        },
        skeletonInfo: {
            flex: 1
        },
        skeletonUsername: {
            width: 120,
            height: 16,
            backgroundColor: theme.skeletonBackground,
            borderRadius: 4,
            marginBottom: 4
        },
        skeletonLocation: {
            width: 80,
            height: 14,
            backgroundColor: theme.skeletonBackground,
            borderRadius: 4
        },
        skeletonContent: {
            height: 60,
            backgroundColor: theme.skeletonBackground,
            borderRadius: 4,
            marginBottom: 12
        },
        skeletonFooter: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center"
        },
        skeletonLikes: {
            width: 60,
            height: 16,
            backgroundColor: theme.skeletonBackground,
            borderRadius: 4
        },
        muteButton: {
            position: "absolute",
            bottom: 20,
            right: 40,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            padding: 8,
            borderRadius: 20,
            zIndex: 20
        },
        pageIndicator: {
            position: "absolute",
            right: 30,
            top: 10,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            padding: 5,
            borderRadius: 10
        },
        pageIndicatorText: {
            color: "white",
            fontSize: 12
        },
        fullMedia: {
            width: screenWidth,
            height: screenWidth
        },
        mediaContainer: {
            width: screenWidth,
            height: screenWidth,
            backgroundColor: '#1a1a1a',
            overflow: "hidden"
        },
        heartOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'transparent',
            zIndex: 15
        },
        aiBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#05f0d8',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 12,
            marginLeft: 8
        },
        aiBadgeText: {
            color: '#000',
            fontSize: 10,
            fontWeight: 'bold',
            marginLeft: 2
        },
        previewImage: {
            position: "absolute",
            width: "100%",
            height: "100%",
            zIndex: 5
        },
        endOfListText: {
            textAlign: 'center',
            color: theme.textSecondary,
            padding: 20,
            paddingBottom: 40,
            fontSize: 14
        },
        card: {
            margin: 20,
            marginBottom: 20,
            padding: 15,
            paddingBottom: 40,
            backgroundColor: theme.background,
            borderRadius: 12,
            alignItems: 'center',
        },
        cardText: {
            fontSize: 16,
            fontFamily: "Dank Mono Bold",
includeFontPadding:false,
            color: theme.textPrimary,
        },
        cardSub: {
            fontSize: 13,
            color: '#666',
            marginTop: 4,
        },

    });
}

// ... Interfaces ...
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
    media: MediaItem[];
    is_ai_generated: boolean;
    moderation_status: string;
}

interface LikedPosts {
    [key: number]: boolean;
}

type VideoStorage =
    | { storage: "cloudinary"; is_video: true }
    | { storage: "r2"; is_video: true }
    | false;

// ... Utils ...
const isVideo = (url: string): VideoStorage => {
    if (url.includes("/video/")) {
        return { storage: "cloudinary", is_video: true };
    }
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    if (videoExtensions.some(ext => url.toLowerCase().endsWith(ext))) {
        return { storage: "r2", is_video: true };
    }
    return false;
};

const getVideoUrls = (mediaItem: MediaItem) => {
    const videoCheck = isVideo(mediaItem.media_url);

    if (!videoCheck) {
        return { preview: mediaItem.media_url, hd: mediaItem.media_url, isVideo: false };
    }

    if (videoCheck.storage === "cloudinary") {
        const previewUrl = mediaItem.media_url.replace(
            '/video/upload/',
            '/video/upload/q_auto:low,w_400,f_jpg,so_0/'
        );
        const hdUrl = mediaItem.media_url.replace(
            '/video/upload/',
            '/video/upload/q_auto:good,f_auto,vc_h264:baseline,br_1500k/'
        );
        return { preview: previewUrl, hd: hdUrl, isVideo: true };
    }

    return {
        preview: mediaItem.media_preview || mediaItem.media_url,
        hd: mediaItem.media_url,
        isVideo: true
    };
};

// --- COMPONENTS ---
const PostSkeleton = memo(() => {
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(animatedValue, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: false
                }),
                Animated.timing(animatedValue, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: false
                })
            ])
        ).start();
    }, []);

    const animatedStyle = {
        backgroundColor: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [theme.skeletonBackground, theme.skeletonHighlight]
        })
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

const MediaItemComponent = memo(({ item, postId, onLike, isLiked, isVisible }: { item: MediaItem; postId: number; onLike: (postId: number) => void; isLiked: boolean; isVisible: boolean; }) => {
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
        
        if (tapTimer.current) {
            clearTimeout(tapTimer.current);
        }
        
        if (tapCount.current === 2) {
            animateHeart();
            if (!isLiked) {
                onLike(postId);
            }
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => {
                tapCount.current = 0;
            }, 300);
        }
    };

    useEffect(() => {
        return () => {
            if (tapTimer.current) {
                clearTimeout(tapTimer.current);
            }
        };
    }, []);

    const animateHeart = () => {
        setShowHeart(true);
        Animated.sequence([
            Animated.spring(heartAnim, {
                toValue: 1,
                friction: 3,
                useNativeDriver: true
            }),
            Animated.delay(500),
            Animated.timing(heartAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            })
        ]).start(() => {
            setShowHeart(false);
            heartAnim.setValue(0);
        });
    };

    useEffect(() => {
        if (!videoRef.current) return;
        if (!isVisible) {
            videoRef.current.unloadAsync();
            setShowPreview(true);
        };
        return () => {
            if (videoRef.current) {
                videoRef.current.unloadAsync().catch(() => {});
            };
        };
    }, [isVisible, isVideoMedia]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (status.isLoaded && status.isPlaying) {
            setIsLoading(false);
            setTimeout(() => setShowPreview(false), 150);
        }
    };

    return (
        <Pressable
            onPress={handleDoublePress}
            style={styles.mediaContainer}
        >
            {isVideoMedia ? (
                <>
                    {(showPreview || !isVisible) && (
                        <FastImage
                            source={{
                                uri: preview,
                                priority: FastImage.priority.high,
                                cache: FastImage.cacheControl.immutable
                            }}
                            style={styles.previewImage}
                            resizeMode={FastImage.resizeMode.cover}
                        />
                    )}
                    {isVideoMedia && isVisible && (
                        <Video
                            ref={videoRef}
                            style={styles.fullMedia}
                            source={{ uri: hd }}
                            resizeMode={ResizeMode.COVER}
                            isLooping
                            isMuted={isMuted}
                            shouldPlay={isVisible}
                            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                        />
                    )}

                    {isLoading && isVisible && (
                        <View style={styles.mediaLoading}>
                            <ActivityIndicator size="large" color="#ffffff" />
                        </View>
                    )}
                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation();
                            setIsMuted(prev => !prev);
                        }}
                        style={styles.muteButton}
                    >
                        <MaterialIcons
                            name={isMuted ? "volume-off" : "volume-up"}
                            size={24}
                            color="white"
                        />
                    </Pressable>
                </>
            ) : (
                <FastImage
                    source={{
                        uri: item.media_url,
                        priority: FastImage.priority.normal,
                        cache: FastImage.cacheControl.immutable
                        
                    }}
                    style={styles.mediaImage}
                    resizeMode={FastImage.resizeMode.cover}   
                />
            )}
            {showHeart && (
                <Animated.View
                    style={[
                        styles.heartOverlay,
                        {
                            transform: [{ scale: heartAnim }],
                            opacity: heartAnim
                        }
                    ]}
                    pointerEvents="none"
                >
                    <MaterialIcons name="favorite" size={80} color="#ff0000" />
                </Animated.View>
            )}
        </Pressable>
    );
}, (prev, next) => prev.isVisible === next.isVisible && prev.isLiked === next.isLiked && prev.item.id === next.item.id);

const PostItem = memo(({
    item,
    isLiked,
    isVisible,
    userID,
    theme,
    styles,
    router,
    toggleLike,
    onDelete,
    openComments,
    dropdownVisible,
    setDropdownVisible,
    setToastMessage,
    setToastSuccess,
    setIsToastVisible
}: any) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

    const needsMoreButton = item.about?.length > 100;
    const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
    const mediaItems = item.media || [];
    const hasMedia = mediaItems.length > 0;

    return (
        <View style={styles.postContainer}>
            <View style={styles.postHeader}>
                <FastImage source={{ uri: `${item.owner__avatar}`,
                    priority: FastImage.priority.normal,
                    cache: FastImage.cacheControl.immutable 
                }} style={styles.avatar} />
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={styles.userInfo}
                    onPress={() => router.push({ pathname: "/user-profile", params: { id: item.owner__user_id, last_page: "home" } })}
                >
                    <View style={styles.usernameContainer}>
                        <View style={styles.usernameRow}>
                            <Text style={styles.username}>{item.owner__username}</Text>
                            {item.owner__official ? (
                                <View style={styles.badgeWrapper}>
                                    <VerifyBadge 
                                        isLooped={true} 
                                        isVisible={isVisible} 
                                        haveModal={false} 
                                        isStatic={false} 
                                        size={16}
                                    />
                                </View>
                            ) : null}
                        </View>
                        
                        {item.is_ai_generated && (
                            <View style={styles.aiBadge}>
                                <MaterialIcons name="auto-awesome" size={12} color="#fff" />
                                <Text style={styles.aiBadgeText}>AI</Text>
                            </View>
                        )}
                    </View>
                    {item.location && <Text style={styles.location}>{item.location}</Text>}
                </TouchableOpacity>
                <View style={{ position: "relative" }}>
                    <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        style={{ position: "absolute", right: -2, top: -10, zIndex: 10, padding: 5 }}
                        onPress={(e) => {
                            e.stopPropagation();
                            setDropdownVisible(item.id);
                        }}
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
                                if (message) {
                                    setToastMessage(message);
                                    setToastSuccess(false);
                                    setIsToastVisible(true);
                                } else if (reported) {
                                    setToastSuccess(true);
                                    setToastMessage('Report submitted');
                                    setIsToastVisible(true);
                                }
                            }, 260);
                        }}
                    />
                </View>
            </View>

            {hasMedia && (
                <View style={styles.mediaPlaceholder}>
                    {mediaItems.length > 1 ? (
                        <View style={{ width: screenWidth, height: screenWidth, position: "relative" }}>
                            <FlatList
                                data={mediaItems}
                                renderItem={({ item: mediaItem, index: mediaIndex }) => (
                                    <MediaItemComponent
                                        item={mediaItem}
                                        postId={item.id}
                                        onLike={toggleLike}
                                        isLiked={isLiked}
                                        isVisible={isVisible && currentMediaIndex === mediaIndex}
                                    />
                                )}
                                keyExtractor={mediaItem => mediaItem.id.toString()}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(event) => {
                                    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                                    setCurrentMediaIndex(index);
                                }}
                                updateCellsBatchingPeriod={100}
                                removeClippedSubviews={true}
                                scrollEventThrottle={16}
                                initialNumToRender={1}
                                maxToRenderPerBatch={1}
                                windowSize={2}
                            />
                            <View style={styles.pageIndicator}>
                                <Text style={styles.pageIndicatorText}>{currentMediaIndex + 1}/{mediaItems.length}</Text>
                            </View>
                        </View>
                    ) : (
                        <MediaItemComponent
                            item={mediaItems[0]}
                            postId={item.id}
                            onLike={toggleLike}
                            isLiked={isLiked}
                            isVisible={isVisible}
                        />
                    )}
                </View>
            )}
            {displayText && (
                <View style={styles.postContent}>
                    <Hyperlink 
                        linkStyle={{ color: "#A78BFA", fontWeight: "500" }}
                        onPress={(url: string) => Linking.openURL(url)}>
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

            <View style={styles.postFooter}>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item.id)} style={styles.likesContainer}>
                    <Icon name={isLiked ? "heart" : "heart-outline"} size={24} color={isLiked ? "red" : theme.textPrimary} />
                    <Text style={styles.likesCount}>{formatNumber(item.count_likes)}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => openComments(item)}>
                    <Icon name="chatbubble-outline" size={20} style={{ marginTop: -3 }} color={theme.textPrimary} />
                </TouchableOpacity>
            </View>
            <Text style={styles.postDate}>{timeAgo(item.create_at)}</Text>
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
        return true;
    });

// --- MAIN PAGE ---
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

    const getUserID = async () => {
        const id = await storage.getItem("id")
        setUserID(id ? +id : 0)
    };

    const onRefresh = useCallback(() => {
        if (isFetchingRef.current) return;
        setRefreshing(true);
        setHasMore(true);
        // Force reset
        fetchPosts(false, true, true).then(() => setRefreshing(false));
    }, []);

    // Optimized fetch logic
    const fetchPosts = async (loadMore = false, reset = false, forceReset = false) => {
        if (isFetchingRef.current) return;
        if (!reset && loadMore && !hasMore) return;

        isFetchingRef.current = true; // LOCK
        const shouldReset = forceReset || !isSessionActive;

        if (shouldReset) {
            isSessionActive = true;
        };

        if (loadMore) setLoadingMore(true);
        else if (!reset) setLoading(true);

        try {

            const response = await getRecomendatePosts(shouldReset);
            const newPosts = response.results || [];

            // If backend returns empty array, we are done.
            if (newPosts.length === 0) {
                setHasMore(false);
            } else {
                if (loadMore && !reset) {
                    setPosts(prev => [...prev, ...newPosts]);
                } else {
                    setPosts(newPosts);
                }

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
            setTimeout(() => {
                isFetchingRef.current = false; // UNLOCK
            }, 500);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
        getUserID();
        fetchPosts(false, true); // Initial load treated as reset
    }, []);

    useFocusEffect(
        useCallback(() => {
            return () => {
                setVisiblePostId(null);
            };
        }, [])
    );

    const toggleLike = useCallback((postId: number) => {
        likePost(postId);
        setLikedPosts(prev => {
            const isLiked = !!prev[postId];
            return { ...prev, [postId]: !isLiked };
        });
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

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 70,
        minimumViewTime: 100
    }).current;

    const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            const mostVisible = viewableItems.reduce((prev, cur) => (cur.isViewable && (!prev || cur.index < prev.index)) ? cur : prev, null);
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

    const dataToRender = loading ? Array.from({ length: 2 }).map((_, i) => ({ id: `skeleton-${i}`, type: 'skeleton' })) : posts.filter(p => p.moderation_status === "approved");

    const renderItem = useCallback(({ item }: { item: any }) => {
        if (loading || item.type === 'skeleton') {
            return <PostSkeleton />;
        }
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
            />
        );
    }, [loading, likedPosts, visiblePostId, userID, theme, styles, activeDropdownId]);

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
            <FlatList
                data={dataToRender}
                onScrollBeginDrag={() => setActiveDropdownId(null)}
                keyExtractor={item => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                onEndReached={() => {
                    if (!loading && !loadingMore && hasMore && !isFetchingRef.current) {
                        fetchPosts(true);
                    }
                }}
                ListEmptyComponent={(
                <View style={styles.card}>
                    <Text style={styles.cardText}>🎉 No more posts for now</Text>
                    <Text style={styles.cardSub}>Check back later for new vibes!</Text>
                </View>)}
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