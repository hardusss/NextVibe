import React, {useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  useColorScheme,
  StatusBar,
  Animated,
  ActivityIndicator,
  Pressable
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Icon from "react-native-vector-icons/Ionicons";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import getMenuPosts from "@/src/api/menu.posts";
import timeAgo from "@/src/utils/formatTime";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import likePost from "@/src/api/like.post";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import FastImage from 'react-native-fast-image';
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import { storage } from '@/src/utils/storage';

const { width: screenWidth } = Dimensions.get("window");
const ESTIMATED_POST_HEIGHT = screenWidth + 200

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
            paddingBottom: 50,
        },
        postContainer: {
            borderRadius: 12,
            marginBottom: 16,
            padding: 14,
            position: "relative",
        },
        postHeader: {
            position: "relative",
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
        headerContainer: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 10,
            backgroundColor: theme.background
        },
        backButton: {
            marginRight: 10
        },
        headerTitle: {
            fontSize: 28,
            color: theme.textPrimary,
            fontWeight: "600"
        },
        error: {
            color: "red",
            textAlign: "center",
            marginBottom: 10,
        },
        previewImage: {
            position: "absolute",
            width: "100%",
            height: "100%",
            zIndex: 5
        }
    });
};

interface MediaItem {
  id: number;
  media_url: string;
  media_preview: string | null;
  type: "image" | "video";
}

interface PostItem {
  post_id: number;
  about: string;
  location: string;
  count_likes: number;
  media: MediaItem[];
  create_at: string;
  user_id: number;
  is_ai_generated: boolean;
  is_comments_enabled: boolean,
  moderation_status: string,
}

interface User {
  id: number;
  username: string;
  avatar: string;
  official: boolean;
}

type VideoStorage = 
    | { storage: "cloudinary"; is_video: true }
    | { storage: "r2"; is_video: true }
    | false;

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
            '/video/upload/q_auto:good,f_auto,vc_h264:baseline,br_1500k/' 
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
    const [isLoading, setIsLoading] = useState(isVideoMedia);
    const [showPreview, setShowPreview] = useState(isVideoMedia);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const tapCount = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);
    
    const videoRef = useRef<Video>(null);

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

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
            return;
        }

        if (status.isLoaded && status.isPlaying) {
            setIsLoading(false);
            setTimeout(() => setShowPreview(false), 150);
        }
    };

    useEffect(() => {
        if (!videoRef.current) return;
        if (!isVisible) {
            videoRef.current.unloadAsync();
            setShowPreview(true);
        }
    }, [isVisible, isVideoMedia]);

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
                            style={[styles.previewImage, isLoading && { opacity: 0.7 }]}
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
                        uri: preview,
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

const UserPosts = () => {
  const router = useRouter();
  let user_id = useLocalSearchParams().user_id;
  const [_, setIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const TARGET_ID = Number(useLocalSearchParams().id);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndices, setCurrentIndices] = useState<{
    [key: number]: number;
  }>({});
  const [likedPosts, setLikedPosts] = useState<{ [key: number]: boolean }>({});
  const [likeCounts, setLikeCounts] = useState<{ [key: number]: number }>({});
  const [expandedPosts, setExpandedPosts] = useState<{
    [key: number]: boolean;
  }>({});
  const [visiblePostId, setVisiblePostId] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupPostId, setPopupPostId] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [isFetching, setIsFetching] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState<{ [key: number]: boolean }>({});
  const [toastMessage, setToastMessage] = useState<string>("Post successfully deleted");
  const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
  const [userID, setUserID] = useState<number>(0);
  const [popupCommentsEnabled, setPopupCommentsEnabled] = useState<boolean>(true);
  const [toastSuccess, setToastSuccess] = useState<boolean>(false);
  
  const getUserID = async () => {
    const id = await storage.getItem("id")
    setUserID(id ? +id : 0)
  }
  
  const clearData = useCallback(() => {
    setPosts([]);
    setUserData(null);
    setCurrentIndices({});
    setLikedPosts({});
    setLikeCounts({});
    setExpandedPosts({});
    setVisiblePostId(null);
    setIndex(0);
    setHasMore(true);
  }, []);

  const handlePostDeleted = (postId: number) => {
    setToastMessage("Post successfully deleted")
    setToastSuccess(true)
    setIsToastVisible(true);
    setPosts(prevPosts => prevPosts.filter(post => post.post_id !== postId));
    setDropdownVisible(prev => ({ ...prev, [postId]: false }));
  };

  useFocusEffect(
    useCallback(() => {
      clearData();
      fetchPosts();
      getUserID();
      return () => {
        clearData();
      };
    }, [user_id, clearData])
  );

  const fetchPosts = useCallback(async () => {
    if (isFetching || !hasMore) return;
    setIsFetching(true);
    setLoading(true);
    setError(null);
    try {
      const data = await getMenuPosts(+user_id, 0, 100);
      if (data) {
        setPosts(data.data);
        setUserData(data.user)
        setHasMore(data.more_posts);
        
        // Initialize like counts
        const counts: { [key: number]: number } = {};
        data.data.forEach((post: PostItem) => {
          counts[post.post_id] = post.count_likes;
        });
        setLikeCounts(counts);
        
        if (data.liked_posts) {
          const newLikedPosts = data.liked_posts.reduce(
            (acc: any, liked_id: number) => {
              acc[liked_id] = true;
              return acc;
            },
            {}
          );
          setLikedPosts(newLikedPosts);
        }
      }
    } catch (err) {
      setError("Error downloading posts");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [user_id, isFetching, hasMore]);

  useFocusEffect(
    useCallback(() => {
      if (!posts.length) return;
      const index = posts.findIndex((item) => item.post_id == TARGET_ID);
      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true });
        }, 300);
      }
    }, [TARGET_ID, posts])
  );

  const toggleLike = useCallback((postId: number) => {
    likePost(postId);
    
    setLikedPosts((prevLiked) => ({
      ...prevLiked,
      [postId]: !prevLiked[postId],
    }));
    
    setLikeCounts((prevCounts) => {
      const isCurrentlyLiked = likedPosts[postId];
      const currentCount = prevCounts[postId] || 0;
      
      return {
        ...prevCounts,
        [postId]: isCurrentlyLiked 
          ? Math.max(0, currentCount - 1)
          : currentCount + 1
      };
    });
  }, [likedPosts]);

  const toggleExpand = (postId: number) => {
    setExpandedPosts((prevExpanded) => ({
      ...prevExpanded,
      [postId]: !prevExpanded[postId],
    }));
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: any[] }) => {
      if (viewableItems.length > 0) {
        const mostVisibleItem = viewableItems.reduce((prev, current) => {
          return (current.isViewable && (!prev || current.index < prev.index)) ? current : prev;
        }, null);
        
        if (mostVisibleItem && mostVisibleItem.item) {
          setVisiblePostId(mostVisibleItem.item.post_id);
        }
      } else {
        setVisiblePostId(null);
      }
    }
  ).current;

  const renderPostItem = ({
    item,
  }: {
    item: PostItem;
    index: number;
  }) => {
    const isLiked = likedPosts[item.post_id] ?? false;
    const likeCount = likeCounts[item.post_id] ?? item.count_likes;
    const isExpanded = expandedPosts[item.post_id] ?? false;
    const needsMoreButton = item.about.length > 100;
    const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
    const isVisible = visiblePostId === item.post_id;
    
    if (item.moderation_status !== "approved"){
      return <></>
    }
    
    return (
      <View style={styles.postContainer}>
        <View style={styles.postHeader}>
          {userData && (
            <>
              <FastImage source={{ uri:  `${userData.avatar}`,
                    priority: FastImage.priority.normal,
                    cache: FastImage.cacheControl.immutable 
                }} style={styles.avatar} />
              <View style={styles.userInfo}>
                <View style={styles.usernameContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.username}>{userData?.username}</Text>
                    {userData?.official && (
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
              </View>
             <View style={{position: "relative"}}>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                style={{position: "absolute", right: -2, top: -10, zIndex: 10}}
                onPress={(e) => {
                  e.stopPropagation();
                  setDropdownVisible(prev => {
                    const newState = { ...prev };
                    Object.keys(newState).forEach(key => {
                      if (Number(key) !== item.post_id) {
                        newState[Number(key)] = false;
                      }
                    });
                    newState[item.post_id] = !prev[item.post_id];
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
                isVisible={dropdownVisible[item.post_id] || false}
                isOwner={userID === item.user_id}
                postId={item.post_id}
                onClose={() => setDropdownVisible(prev => ({
                  ...prev,
                  [item.post_id]: false
                }))}
                onPostDeleted={() => handlePostDeleted(item.post_id)}
                onPostDeletedFail={() => {
                  setToastMessage("Error deleting post")
                  setToastSuccess(false);
                  setIsToastVisible(true);
                }}
                onReportResult={(reported?: boolean, message?: string) => {
                  setDropdownVisible(prev => ({ ...prev, [item.post_id]: false }));
                  setTimeout(() => {
                    if (message) {
                      setToastMessage(message);
                      setToastSuccess(false)
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
            </>
          )}
        </View>
        
        <View style={styles.mediaPlaceholder}>
          {item.media.length === 1 ? (
            <MediaItemComponent 
              item={item.media[0]}
              postId={item.post_id}
              onLike={toggleLike}
              isLiked={isLiked}
              isVisible={isVisible}
            />
          ) : (
            <View style={{ position: "relative", width: screenWidth }} pointerEvents="box-none">
              <FlatList
                data={item.media}
                renderItem={({ item: mediaItem, index: mediaIndex}) => (
                  <MediaItemComponent 
                    item={mediaItem} 
                    postId={item.post_id}
                    onLike={toggleLike}
                    isLiked={isLiked}
                    isVisible={isVisible && (currentIndices[item.post_id] ?? 0) === mediaIndex}
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
                    if (prev[item.post_id] !== index) {
                      return { ...prev, [item.post_id]: index };
                    }
                    return prev;
                  });
                }}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
                updateCellsBatchingPeriod={100}
                removeClippedSubviews={true}
              />
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>
                  {((currentIndices[item.post_id] ?? 0) + 1)}/{item.media.length}
                </Text>
              </View>
            </View>
          )}
        </View>
        {displayText && (
            <View style={styles.postContent}>
              <Text style={styles.postText}>{displayText}</Text>
              {needsMoreButton && (
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleExpand(item.post_id)}>
                  <Text style={{ color: theme.accentColor, marginTop: 5 }}>
                    {isExpanded ? "Show less" : "Read more"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
        )}
        
        
        <View style={styles.postFooter}>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item.post_id)} style={styles.likesContainer}>
            <Icon 
              name={isLiked ? "heart" : "heart-outline"} 
              size={24} 
              color={isLiked ? "red" : theme.textPrimary} 
            />
            <Text style={styles.likesCount}>{formatNumber(likeCount)}</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => {
            setPopupCommentsEnabled(item.is_comments_enabled)
            setPopupPostId(item.post_id);
            setShowPopup(true);
          }}>
            <Icon name="chatbubble-outline" size={20} color={theme.textPrimary} style={{marginTop: -3}}/>
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
      <StatusBar backgroundColor={colorScheme === "dark" ? "#0A0410" : "white"} />
      <Web3Toast
        message={toastMessage}
        visible={isToastVisible}
        onHide={() => setIsToastVisible(false)}
        isSuccess={toastSuccess}
      />
      <View style={styles.headerContainer}>
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons
            name="keyboard-arrow-left"
            size={42}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Posts</Text>
      </View>

      {showPopup && (
        <PopupModal
          post_id={popupPostId as number}
          onClose={() => setShowPopup(false)}
          isCommentsEnabled={popupCommentsEnabled}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      
      <FlatList
        ref={flatListRef}
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => `post_${item.post_id}`}
        contentContainerStyle={styles.listContainer}
        initialScrollIndex={posts.findIndex(
          (item) => item.post_id === TARGET_ID
        )}
        onEndReached={() => fetchPosts()}
        onEndReachedThreshold={0.8}
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={2}
        updateCellsBatchingPeriod={100}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setDropdownVisible({})}   
        onMomentumScrollBegin={() => setDropdownVisible({})}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 70,
          minimumViewTime: 200,
        }}
        getItemLayout={(data, index) => ({
          length: ESTIMATED_POST_HEIGHT,
          offset: ESTIMATED_POST_HEIGHT * index,
          index,
        })}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="sentiment-dissatisfied" size={60} color="#58a6ff" />
              <Text style={styles.emptyText}>No posts found</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

export default UserPosts;