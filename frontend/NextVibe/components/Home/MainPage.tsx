import { View, Text, FlatList, TouchableOpacity, StyleSheet, Dimensions, useColorScheme, Animated, RefreshControl, TouchableWithoutFeedback } from "react-native";
import Header from "./Header";
import { useEffect, useState, useCallback, useRef } from "react";
import getRecomendatePosts from "@/src/api/get.recomendate.posts";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter } from "expo-router";
import formatNumber from "@/src/utils/formatNumber";
import GetApiUrl from "@/src/utils/url_api";
import PopupModal from "../Comments/CommentPopup";
import { Video, ResizeMode } from "expo-av";
import likePost from "@/src/api/like.post";
import FastImage from 'react-native-fast-image';
import timeAgo from "@/src/utils/formatTime";
const { width: screenWidth } = Dimensions.get("window");

const darkTheme = {
    background: "#130E1D",
    cardBackground: "#130E1D",
    textPrimary: "#E3E3E3",
    textSecondary: "#aaa",
    skeletonBackground: "#1a171f",
    skeletonHighlight: "#444",
    accentColor: "#58a6ff",
    likeColor: "#ff4757",
    shadowColor: "#000"
};

const lightTheme = {
    background: "#f5f5f5",
    cardBackground: "rgba(255, 255, 255, 0.9)",
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
        backgroundColor: "rgba(0, 0, 0, 0.3)"
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
        bottom: 15,
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
        bottom: 10,
        right: 10,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: 8,
        borderRadius: 20,
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
        backgroundColor: 'transparent'
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
    type: "image" | "video";
}

interface Post {
    id: number;
    about: string;
    create_at: string;
    location: string;
    count_likes: number;
    owner__user_id: number;
    owner__username: string;
    owner__avatar: string;
    owner__official: boolean;
    media: MediaItem[];
    is_ai_generated: boolean;
}

interface LikedPosts {
    [key: number]: boolean;
}

const MediaItemComponent = ({ item, postId, onLike, isLiked }: { 
    item: MediaItem; 
    postId: number;
    onLike: (postId: number) => void;
    isLiked: boolean;
}) => {
    const mediaUrl = `${GetApiUrl().slice(0, 25)}/media/${item.media_url}`;
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const lastTap = useRef(0);
    const videoRef = useRef<Video>(null);
    const styles = getStyles(useColorScheme() === "dark" ? darkTheme : lightTheme);

    const handleDoublePress = () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            // Показуємо анімацію завжди при подвійному тапі
            animateHeart();
            // Ставимо лайк тільки якщо його ще немає
            if (!isLiked) {
                onLike(postId);
            }
        }
        lastTap.current = now;
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

    return (
        <TouchableWithoutFeedback onPress={handleDoublePress}>
            <View style={styles.mediaContainer}>
                {item.media_url.match(/\.(mp4|webm|ogg|mov|mkv)$/) ? (
                    <>
                        <Video
                            ref={videoRef}
                            source={{ uri: mediaUrl }}
                            style={styles.fullMedia}
                            useNativeControls={false}
                            isLooping
                            shouldPlay={false}
                            resizeMode={ResizeMode.COVER}
                            volume={isMuted ? 0 : 1}
                        />
                        <TouchableOpacity 
                            onPress={() => setIsMuted(prev => !prev)} 
                            style={styles.muteButton}
                        >
                            <MaterialIcons 
                                name={isMuted ? "volume-off" : "volume-up"} 
                                size={24} 
                                color="white" 
                            />
                        </TouchableOpacity>
                    </>
                ) : (
                    <FastImage
                        source={{ 
                            uri: mediaUrl,
                            priority: FastImage.priority.normal,
                            cache: FastImage.cacheControl.immutable
                        }}
                        style={styles.mediaImage}
                        resizeMode={FastImage.resizeMode.cover}
                    />
                )}
                {showHeart && (
                    <Animated.View style={[styles.heartOverlay, {
                        transform: [{ scale: heartAnim }],
                        opacity: heartAnim
                    }]}>
                        <MaterialIcons name="favorite" size={80} color="#ff0000" />
                    </Animated.View>
                )}
            </View>
        </TouchableWithoutFeedback>
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
    const [expandedPosts, setExpandedPosts] = useState<{[key: string]: boolean}>({});
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);    
    const [refreshing, setRefreshing] = useState(false);
    const [currentIndices, setCurrentIndices] = useState<{
        [key: number]: number;
      }>({});
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
                            ? post.count_likes - 1 
                            : post.count_likes + 1
                    };
                }
                return post;
            })
        );
    };

    const toggleExpandText = (postId: number) => {
        setExpandedPosts(prev => ({
            ...prev,
            [postId]: !prev[postId]
        }));
    };
    
    const renderItem = ({ item, index }: { item: Post; index: number }) => {        const isLiked = likedPosts[item.id] ?? false;
        const isExpanded = expandedPosts[item.id] ?? false;
        const needsMoreButton = item.about.length > 100;
        const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
        return (
            <View style={styles.postContainer}>
                <View style={styles.postHeader}>
                    <FastImage 
                        source={{ uri: `${GetApiUrl().slice(0, 25)}/media/${item.owner__avatar}` }} 
                        style={styles.avatar} 
                    />
                    <TouchableOpacity style={styles.userInfo} onPress={() => router.push({ pathname: "/user-profile", params: { id: item.owner__user_id, last_page: "home" } })}>                        <View style={styles.usernameContainer}>
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
                </View>
                
                <View style={styles.mediaPlaceholder}>
                    {item.media.length === 1 ? (
                        <MediaItemComponent 
                            item={item.media[0]}
                            postId={item.id}
                            onLike={toggleLike}
                            isLiked={isLiked}
                        />
                    ) : (
                        <View style={{ position: "relative", width: screenWidth }}>
                            <FlatList
                                data={item.media}
                                renderItem={({ item: mediaItem }) => (
                                    <MediaItemComponent 
                                        item={mediaItem} 
                                        postId={item.id}
                                        onLike={toggleLike}
                                        isLiked={isLiked}
                                    />
                                )}
                                keyExtractor={mediaItem => mediaItem.id.toString()}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                onScroll={(event) => {
                                    const offsetX = event.nativeEvent.contentOffset.x;
                                    const index = Math.floor(offsetX / screenWidth);
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
                                    {(currentIndices[item.id] || 0) + 1}/{item.media.length}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
                
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
                        setPopupPostId(item.id);
                        setShowPopup(true);
                    }}>
                        <Icon name="chatbubble-outline" size={24} color={theme.textPrimary} />
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
            <Header />
            {showPopup && <PopupModal post_id={popupPostId as number} onClose={() => setShowPopup(false)}/>}
            
            {loading ? (
                <FlatList
                    data={[1, 2, 3, 4, 5, 6]}
                    keyExtractor={(item) => `skeleton-${item}_${Math.random()}`}
                    renderItem={() => <PostSkeleton />}
                    contentContainerStyle={styles.listContainer}
                />
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item, index) => `${item.id}_${index}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    onEndReached={() => fetchPosts(true)}
                    onEndReachedThreshold={0.8}
                    initialNumToRender={6}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListFooterComponent={
                        loadingMore ? (
                            <View style={styles.loadingMore}>
                                <ActivityIndicator size="small" color="#58a6ff" />
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

