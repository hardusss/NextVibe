import React, { useRef, useState, useCallback } from "react";
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
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import Icon from "react-native-vector-icons/Ionicons";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import getMenuPosts from "@/src/api/menu.posts";
import GetApiUrl from "@/src/utils/url_api";
import timeAgo from "@/src/utils/formatTime";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import likePost from "@/src/api/like.post";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import FastImage from 'react-native-fast-image';
import DropDown from "./DropDown";


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
}

interface User {
  id: number;
  username: string;
  avatar: string;
  official: boolean;
}

const getCloudinaryTransformations = (url: string) => {
    if (!url.includes('cloudinary.com')) {
        return { preview: url, hd: url };
    }

    const previewUrl = url.replace(
        '/video/upload/',
        '/video/upload/q_auto:low,w_400,f_jpg,so_0/'
    );

    const hdUrl = url.replace(
        '/video/upload/',
        '/video/upload/q_auto:good,f_auto,vc_auto,br_1500k/'
    );

    return { preview: previewUrl, hd: hdUrl };
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
    const mediaUrl = item.media_url;
    const isVideo = item.media_url.includes("/video/");
    
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const [isLoading, setIsLoading] = useState(isVideo);
    const [showPreview, setShowPreview] = useState(isVideo);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const lastTap = useRef(0);
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const styles = getStyles(theme);

    const { preview, hd } = isVideo ? getCloudinaryTransformations(mediaUrl) : { preview: mediaUrl, hd: mediaUrl };
    
    const player = useVideoPlayer(isVideo ? hd : '', player => {
        player.loop = true;
        player.muted = isMuted;
    });

    const handleDoublePress = () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            animateHeart();
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

    React.useEffect(() => {
        if (!isVideo) return;

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
    }, [isVideo, isVisible]);

    React.useEffect(() => {
        if (!isVideo) return;

        if (isVisible) {
            player.play();
        } else {
            player.pause();
            player.currentTime = 0;
            setShowPreview(true);
        }
    }, [isVisible, isVideo]);

    React.useEffect(() => {
        if (isVideo) {
            player.muted = isMuted;
        }
    }, [isMuted, isVideo]);

    return (
        <TouchableWithoutFeedback onPress={handleDoublePress}>
            <View style={styles.mediaContainer}>
                {isVideo ? (
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

  const clearData = useCallback(() => {
    setPosts([]);
    setUserData(null);
    setCurrentIndices({});
    setLikedPosts({});
    setExpandedPosts({});
    setVisiblePostId(null);
    setIndex(0);
    setHasMore(true);
  }, []);

  const handlePostDeleted = (postId: number) => {
    setPosts(prevPosts => prevPosts.filter(post => post.post_id !== postId));
    setDropdownVisible(prev => ({ ...prev, [postId]: false }));
  };
  const closeAllDropdowns = () => {
      setDropdownVisible({});
  };

  useFocusEffect(
    useCallback(() => {
      clearData();
      fetchPosts();
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

  const toggleLike = (postId: number) => {
    likePost(postId);
    setLikedPosts((prevLiked) => ({
      ...prevLiked,
      [postId]: !prevLiked[postId],
    }));
    setPosts(prevPosts => 
        prevPosts.map(post => {
            if (post.post_id === postId) {
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
    const isExpanded = expandedPosts[item.post_id] ?? false;
    const needsMoreButton = item.about.length > 100;
    const displayText = needsMoreButton && !isExpanded ? `${item.about.slice(0, 100)}...` : item.about;
    const isVisible = visiblePostId === item.post_id;

    return (
      <View style={styles.postContainer}>
        <View style={styles.postHeader}>
          {userData && (
            <>
              <FastImage 
                source={{ uri: `${GetApiUrl().slice(0, 25)}/media/${userData.avatar}` }} 
                style={styles.avatar} 
              />
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
              <TouchableOpacity 
                style={{position: "absolute", right: 10, zIndex: 10}}
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
                isOwner={userData?.id === item.user_id}
                postId={item.post_id}
                onClose={() => setDropdownVisible(prev => ({
                  ...prev,
                  [item.post_id]: false
                }))}
                onPostDeleted={() => handlePostDeleted(item.post_id)}
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
            <View style={{ position: "relative", width: screenWidth }}>
              <FlatList
                data={item.media}
                renderItem={({ item: mediaItem }) => (
                  <MediaItemComponent 
                    item={mediaItem} 
                    postId={item.post_id}
                    onLike={toggleLike}
                    isLiked={isLiked}
                    isVisible={isVisible}
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
              />
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>
                  {((currentIndices[item.post_id] ?? 0) + 1)}/{item.media.length}
                </Text>
              </View>
            </View>
          )}
        </View>
        
        <View style={styles.postContent}>
          <Text style={styles.postText}>{displayText}</Text>
          {needsMoreButton && (
            <TouchableOpacity onPress={() => toggleExpand(item.post_id)}>
              <Text style={{ color: theme.accentColor, marginTop: 5 }}>
                {isExpanded ? "Show less" : "Read more"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.postFooter}>
          <TouchableOpacity onPress={() => toggleLike(item.post_id)} style={styles.likesContainer}>
            <Icon 
              name={isLiked ? "heart" : "heart-outline"} 
              size={24} 
              color={isLiked ? "red" : theme.textPrimary} 
            />
            <Text style={styles.likesCount}>{formatNumber(item.count_likes)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
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
      
      <View style={styles.headerContainer}>
        <TouchableOpacity 
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
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      
      <FlatList
        ref={flatListRef}
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item, index) => `${item.post_id}_${index}`}
        contentContainerStyle={styles.listContainer}
        initialScrollIndex={posts.findIndex(
          (item) => item.post_id === TARGET_ID
        )}
        getItemLayout={(data, index) => ({
          length: 500,
          offset: 500 * index,
          index,
        })}
        onEndReached={() => fetchPosts()}
        onEndReachedThreshold={0.8}
        initialNumToRender={6}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 70,
          minimumViewTime: 100,
        }}
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