import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, Dimensions, useColorScheme, Animated, RefreshControl, ActivityIndicator } from "react-native";
import Header from "./Header";
import { useEffect, useState, useCallback, useRef } from "react";
import getRecomendatePosts from "@/src/api/get.recomendate.posts";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter } from "expo-router";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import { VideoView, useVideoPlayer } from "expo-video";
import likePost from "@/src/api/like.post";
import FastImage from 'react-native-fast-image';
import timeAgo from "@/src/utils/formatTime";
import { Platform, UIManager } from 'react-native';
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable } from "react-native";

const { width: screenWidth } = Dimensions.get("window");

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
        paddingBottom: 50,
    },
    postContainer: {
        borderRadius: 12,
        marginBottom: 16,
        padding: 14,
        position: "relative",
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
    username: {
        fontSize: 16,
        fontWeight: "600",
        color: theme.textPrimary
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
        overflow: "hidden",
    },
    mediaImage: {
        width: "100%",
        height: "100%",
    },
    mediaVideo: {
        width: "100%",
        height: "100%",
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
        position: "relative",
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
    skeletonList: {
        paddingHorizontal: 16
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
        borderRadius: 10,
    },
    pageIndicatorText: {
        color: "white",
        fontSize: 12,
    },
    fullMedia: {
        width: screenWidth,
        height: screenWidth,
    },
    post: {
        width: screenWidth,
        backgroundColor: theme.background,
    },
    mediaContainer: {
        width: screenWidth,
        height: screenWidth,
        backgroundColor: '#1a1a1a',
        overflow: "hidden",
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
        marginLeft: 8,
    },
    aiBadgeText: {
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
        marginLeft: 2,
    },
    previewImage: {
        position: "absolute",
        width: "100%",
        height: "100%",
        zIndex: 5
    }
});
}

const PostSkeleton = () => {
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
            <View style={styles.skeletonFooter}>
                <Animated.View style={[styles.skeletonLikes, animatedStyle]} />
            </View>
        </View>
    );
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
    is_comments_enabled: boolean,
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
    | false

const isVideo = (url: string): VideoStorage => {
    if (url.includes("/video/")) {
        return {
            storage: "cloudinary",
            is_video: true
        };
    }

    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    if (videoExtensions.some(ext => url.toLowerCase().endsWith(ext))) {
        return {
            storage: "r2",
            is_video: true
        };
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
            '/video/upload/q_auto:good,f_auto,vc_auto,br_1500k/'
        );

        return { preview: previewUrl, hd: hdUrl, isVideo: true };
    }

    // R2 storage
    return { 
        preview: mediaItem.media_preview || mediaItem.media_url, 
        hd: mediaItem.media_url,
        isVideo: true
    };
};

const MediaItemComponent = ({ 
    item, 
    postId, 
    onLike, 
    isLiked,
    isVisible 
}: { 
    item: MediaItem; 
    postId: number;
    onLike: (postId: number) => void;
    isLiked: boolean;
    isVisible: boolean;
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
    const tapCount = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    
    const player = useVideoPlayer(isVideoMedia ? hd : '', player => {
        player.loop = true;
        player.muted = isMuted;
    });

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
            return () => {
                if (tapTimer.current) {
                    clearTimeout(tapTimer.current);
                }
            };
        }, []);

    useEffect(() => {
        if (!isVideoMedia) return;

        const subscription = player.addListener('statusChange', (status) => {
            if (status.status === 'readyToPlay') {
                setIsLoading(false);
                setTimeout(() => setShowPreview(false), 150);
            }
            else if (status.status === 'loading') {
                if (isVisible) {
                    setIsLoading(true);
                }
            }
            else if (status.status === 'idle') {
                setIsLoading(false);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isVideoMedia, isVisible]);

    useEffect(() => {
        if (!isVideoMedia) return;

        if (isVisible) {
            player.play();
        } else {
            player.pause();
            player.currentTime = 0;
            setShowPreview(true);
        }
    }, [isVisible, isVideoMedia]);

    useEffect(() => {
        if (isVideoMedia) {
            player.muted = isMuted;
        }
    }, [isMuted, isVideoMedia]);

        return (
        <Pressable 
            onPress={handleDoublePress}
            style={styles.mediaContainer}
        >
            {isVideoMedia ? (
                <>
                    {showPreview && (
                        <FastImage
                            source={{ 
                                uri: preview,
                                priority: FastImage.priority.high,
                            }}
                            style={styles.previewImage}
                            resizeMode={FastImage.resizeMode.cover}
                        />
                    )}
                    <VideoView
                        style={styles.fullMedia}
                        player={player}
                        allowsFullscreen={false}
                        allowsPictureInPicture={false}
                        nativeControls={false}
                        contentFit="cover"
                    />
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
                    style={[styles.heartOverlay, {
                        transform: [{ scale: heartAnim }],
                        opacity: heartAnim,
                    }]}
                    pointerEvents="none"
                >
                    <MaterialIcons name="favorite" size={80} color="#ff0000" />
                </Animated.View>
            )}
        </Pressable>
    );
};

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
    const [expandedPosts, setExpandedPosts] = useState<{[key: string]: boolean}>({});
    const [visiblePostId, setVisiblePostId] = useState<number | null>(null);
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);    
    const [refreshing, setRefreshing] = useState(false);
    const [currentIndices, setCurrentIndices] = useState<{
        [key: number]: number;
    }>({});
    const [dropdownVisible, setDropdownVisible] = useState<{ [key: number]: boolean }>({});
    const [toastMessage, setToastMessage] = useState<string>("Post successfully deleted");
    const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
    const [userID, setUserID] = useState<number>(0);
    const [toastSuccess, setToastSuccess] = useState<boolean>(false);
    
    const getUserID = async () => {
        const id = await AsyncStorage.getItem("id")
        setUserID(id ? +id : 0)
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchPosts().then(() => setRefreshing(false));
    }, []);
    
    const fetchPosts = async (loadMore = false) => {
        if (loadingMore || (!hasMore && loadMore)) return;

        if (loadMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const response = await getRecomendatePosts();
            const newPosts = response.data;
            if (loadMore) {
                setPosts(prevPosts => [...prevPosts, ...newPosts]);
            } else {
                setPosts(newPosts);
            }
            
            if (response.liked_posts) {
                response.liked_posts.forEach((likedId: number) => {
                    setLikedPosts(prev => ({ ...prev, [likedId]: true }));
                });
            }
            
            setHasMore(newPosts.length === 6);
        } catch (error) {
            console.error("Error fetching recommended posts:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android') {
            UIManager.setLayoutAnimationEnabledExperimental?.(true);
        }
        getUserID();
        fetchPosts();
    }, []);
    

    const toggleLike = (postId: number) => {
        likePost(postId)
        setLikedPosts((prevLiked) => ({
            ...prevLiked,
            [postId]: !prevLiked[postId],
        }));
        setPosts(prevPosts => 
            prevPosts.map(post => {
                if (post.id === postId) {
                    return {
                        ...post,
                        count_likes: likedPosts[postId] 
                            ? post.count_likes > 0 ? post.count_likes - 1 : 0
                            : post.count_likes + 1
                    };
                }
                return post;
            })
        );
    };


    const handlePostDeleted = (postId: number) => {
        setToastMessage("Post successfully deleted")
        setToastSuccess(true);
        setIsToastVisible(true);
        setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
        setDropdownVisible(prev => ({ ...prev, [postId]: false }));
    };

    const toggleExpandText = (postId: number) => {
        setExpandedPosts(prev => ({
            ...prev,
            [postId]: !prev[postId]
        }));
    };

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 70,
        minimumViewTime: 100,
    }).current;

    const onViewableItemsChangedRef = useRef(
        ({ viewableItems }: { viewableItems: any[] }) => {
            if (viewableItems.length > 0) {
                const mostVisibleItem = viewableItems.reduce((prev, current) => {
                    return (current.isViewable && (!prev || current.index < prev.index)) ? current : prev;
                }, null);
                
                if (mostVisibleItem && mostVisibleItem.item) {
                    setVisiblePostId(mostVisibleItem.item.id);
                }
            } else {
                setVisiblePostId(null);
            }
        }
    );

    
    const renderItem = ({ item, index }: { item: Post; index: number }) => {
        const isLiked = likedPosts[item.id] ?? false;
        const isExpanded = expandedPosts[item.id] ?? false;
        const needsMoreButton = item.about?.length > 100;
        const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
        const isVisible = visiblePostId === item.id;
        
        const mediaItems = item.media || [];
        const hasMedia = mediaItems.length > 0;
        return (
            <View style={styles.postContainer}>
                <View style={styles.postHeader}>
                    <FastImage 
                        source={{ uri: `${item.owner__avatar}` }} 
                        style={styles.avatar} 
                    />
                    <TouchableOpacity style={styles.userInfo} onPress={() => router.push({ pathname: "/user-profile", params: { id: item.owner__user_id, last_page: "home" } })}>
                        <View style={styles.usernameContainer}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.username}>{item.owner__username}</Text>
                                {item.owner__official && (
                                    <MaterialIcons name="check-circle" size={16} color="#58a6ff" style={{ marginLeft: 5 }} />
                                )}
                            </View>
                            {item.is_ai_generated && (
                                <View style={styles.aiBadge}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MaterialIcons name="auto-awesome" size={12} color="#fff" />
                                        <Text style={styles.aiBadgeText}>AI</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                         {item.location && (
                            <Text style={styles.location}>{item.location}</Text>
                        )}
                    </TouchableOpacity>
                      <View style={{position: "relative"}}>
                        <TouchableOpacity 
                            style={{position: "absolute", right: -2, top: -10, zIndex: 10}}
                            onPress={(e) => {
                            e.stopPropagation();
                            setDropdownVisible(prev => {
                                const newState = { ...prev };
                                Object.keys(newState).forEach(key => {
                                if (Number(key) !== item.id) {
                                    newState[Number(key)] = false;
                                }
                                });
                                newState[item.id] = !prev[item.id];
                                return newState;
                            });
                            }}
                        >
                            <MaterialCommunityIcons 
                            name="dots-vertical" 
                            color={theme.textPrimary} 
                            size={24}
                            />
                        </TouchableOpacity>

                        <DropDown
                            isVisible={dropdownVisible[item.id] || false}
                            isOwner={userID === item.owner__user_id}
                            postId={item.id}
                            onClose={() => setDropdownVisible(prev => ({
                            ...prev,
                            [item.id]: false
                            }))}
                            onPostDeleted={() => handlePostDeleted(item.id)}
                            onPostDeletedFail={() => {
                                setToastMessage("Error deleting post");
                                setToastSuccess(false);
                                setIsToastVisible(true);
                            }}
                            onReportResult={(reported?: boolean, message?: string) => {
                            // Wait a short moment for the modal to close before showing toast
                            setDropdownVisible(prev => ({ ...prev, [item.id]: false }));
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
                            <View style={{ width: screenWidth, height: screenWidth, position: "relative" }} pointerEvents="box-none">
                                <FlatList
                                    data={mediaItems}
                                    renderItem={({ item: mediaItem, index: mediaIndex }) => (
                                        <MediaItemComponent 
                                            item={mediaItem} 
                                            postId={item.id}
                                            onLike={toggleLike}
                                            isLiked={isLiked}
                                            isVisible={isVisible && (currentIndices[item.id] ?? 0) === mediaIndex}
                                        />
                                    )}
                                    keyExtractor={mediaItem => mediaItem.id.toString()}
                                    horizontal
                                    pagingEnabled
                                    showsHorizontalScrollIndicator={false}
                                    onMomentumScrollEnd={(event) => {
                                        const offsetX = event.nativeEvent.contentOffset.x;
                                        const index = Math.round(offsetX / screenWidth);
                                        setCurrentIndices(prev => {
                                            if (prev[item.id] !== index) {
                                                return { ...prev, [item.id]: index };
                                            }
                                            return prev;
                                        });
                                    }}
                                    scrollEventThrottle={16}
                                    nestedScrollEnabled={true}
                                />
                                <View style={styles.pageIndicator}>
                                    <Text style={styles.pageIndicatorText}>
                                        {((currentIndices[item.id] ?? 0) + 1)}/{mediaItems.length}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            mediaItems.length === 1 && (
                                <MediaItemComponent 
                                    item={mediaItems[0]} 
                                    postId={item.id}
                                    onLike={toggleLike}
                                    isLiked={isLiked}
                                    isVisible={isVisible}
                                />
                            )
                        )}
                    </View>
                )}
                {displayText && (
                    <View style={styles.postContent}>
                        <Text style={styles.postText}>{displayText}</Text>
                        {needsMoreButton && (
                            <TouchableOpacity onPress={() => toggleExpandText(item.id)}>
                                <Text style={{ color: theme.accentColor, marginTop: 5 }}>
                                    {isExpanded ? "Show less" : "Read more"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                
                
                <View style={styles.postFooter}>
                    <TouchableOpacity onPress={() => toggleLike(item.id)} style={styles.likesContainer}>
                        <Icon 
                            name={isLiked ? "heart" : "heart-outline"} 
                            size={24} 
                            color={isLiked ? "red" : theme.textPrimary} 
                        />
                        <Text style={styles.likesCount}>{formatNumber(item.count_likes)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                        setPopupCommentsEnabled(item.is_comments_enabled)
                        setPopupPostId(item.id);
                        setShowPopup(true);
                    }}>
                        <Icon name="chatbubble-outline" size={20} style={{marginTop: -3}} color={theme.textPrimary} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.postDate}>
                    {timeAgo(item.create_at)}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar backgroundColor={colorScheme === "dark" ? "#0A0410" : "white"}></StatusBar>
            <Web3Toast
                    message={toastMessage}
                    visible={isToastVisible}
                    onHide={() => setIsToastVisible(false)}
                    isSuccess={toastSuccess}
                  />
            <Header/>
            {showPopup && <PopupModal post_id={popupPostId as number} onClose={() => setShowPopup(false)} isCommentsEnabled={popupCommentsEnabled}/>}
            
            {loading ? (
                <FlatList
                    data={[1, 2, 3, 4, 5, 6]}
                    keyExtractor={(item) => `skeleton-${item}_${Math.random()}`}
                    renderItem={() => <PostSkeleton />}
                    contentContainerStyle={styles.listContainer}
                    onViewableItemsChanged={onViewableItemsChangedRef.current}
                    viewabilityConfig={viewabilityConfig}
                />
            ) : (
                <FlatList
                    data={posts.filter(p => p.moderation_status === "approved")}
                    onScrollBeginDrag={() => setDropdownVisible({})}   
                    onMomentumScrollBegin={() => setDropdownVisible({})}
                    keyExtractor={(item, index) => `${item.id}_${index}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    onEndReached={() => fetchPosts(true)}
                    onEndReachedThreshold={0.8}
                    initialNumToRender={6}
                    maxToRenderPerBatch={3}
                    windowSize={5}
                    removeClippedSubviews={true}
                    showsVerticalScrollIndicator={false}
                    onViewableItemsChanged={onViewableItemsChangedRef.current}
                    viewabilityConfig={viewabilityConfig}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }

                    ListFooterComponent={
                        loadingMore ? (
                            <View style={styles.loadingMore}>
                                <CustomActivityIndicator size="small" color="#58a6ff" />
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        !loading && (
                            <View style={styles.emptyContainer}>
                                <MaterialIcons name="sentiment-dissatisfied" size={60} color="#58a6ff" />
                                <Text style={styles.emptyText}>No posts found</Text>
                            </View>
                        )
                    }
                />
            )}
        </View>
    );
}