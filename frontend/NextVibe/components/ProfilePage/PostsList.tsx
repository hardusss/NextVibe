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
} from "react-native";
import { Video } from "expo-av";
import Icon from "react-native-vector-icons/Ionicons";
import { MaterialIcons } from "@expo/vector-icons";
import getMenuPosts from "@/src/api/menu.posts";
import GetApiUrl from "@/src/utils/url_api";
import timeAgo from "@/src/utils/formatTime";
import getUserDetail from "@/src/api/user.detail";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"; // Added useFocusEffect
import { RelativePathString } from "expo-router";
import { ResizeMode } from "expo-av";
import likePost from "@/src/api/like.post";
import formatNumber from "@/src/utils/formatNumber";
import PopupModal from "../Comments/CommentPopup";
import FastImage from 'react-native-fast-image';



interface MediaItem {
  id: number;
  media_url: string;
  type: "image" | "video";
}

interface PostItem {
  post_id: number;
  about: string;
  count_likes: number;
  media: MediaItem[];
  create_at: string;
  user_id: number;
  location: string,
  is_ai_generated: boolean;
}

interface User {
  id: number;
  username: string;
  avatar: string;
  official: boolean;
}

const { width: screenWidth } = Dimensions.get("window");

const UserPosts = () => {
  const router = useRouter();
  let user_id = useLocalSearchParams().user_id;
  const [index, setIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const TARGET_ID = Number(useLocalSearchParams().id);
  const previous = useLocalSearchParams().previous as RelativePathString;
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [usersData, setUsersData] = useState<{ [key: number]: User }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndices, setCurrentIndices] = useState<{
    [key: number]: number;
  }>({});
  const [likedPosts, setLikedPosts] = useState<{ [key: number]: boolean }>({});
  const [expandedPosts, setExpandedPosts] = useState<{
    [key: number]: boolean;
  }>({});
  const [visibleVideoIndex, setVisibleVideoIndex] = useState<number | null>(
    null
  );
  const [showPopup, setShowPopup] = useState(false);
  const [popupPostId, setPopupPostId] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const [isFetching, setIsFetching] = useState(false); // Add this line

  const styles = getStyles(isDarkMode);

  const clearData = useCallback(() => {
    setPosts([]);
    setUsersData({});
    setCurrentIndices({});
    setLikedPosts({});
    setExpandedPosts({});
    setVisibleVideoIndex(null);
    setIndex(0);
    setHasMore(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      clearData();
      fetchPosts();
      return () => {
        clearData();
      };
    }, [user_id, clearData])
  );

  const fetchUser = async (userId: number) => {
    if (usersData[userId]) return;

    try {
      const data = await getUserDetail(userId);
      if (data) {
        setUsersData((prevUsers) => ({
          ...prevUsers,
          [userId]: {
            id: data.user_id,
            avatar: `${GetApiUrl().slice(0, 25)}${data.avatar}`,
            official: data.official,
            username: data.username,
          },
        }));
      }
    } catch (err) {
      console.error(`Error fetching user ${userId}:`, err);
    }
  };

  const fetchPosts = useCallback(async () => {
    if (isFetching || !hasMore) return; // Add this check
    setIsFetching(true);
    setLoading(true);
    setError(null);
    try {
      const data = await getMenuPosts(+user_id);
      if (data) {
        setPosts(data.data); // Replace instead of concatenate
        console.log(data.data)
        data.data.forEach((post: PostItem) => fetchUser(post.user_id));
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

  const handleScroll = (event: any, postId: number) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.floor(contentOffsetX / screenWidth);
    setCurrentIndices((prevIndices) => ({ ...prevIndices, [postId]: index }));
  };

  const toggleLike = (postId: number) => {
    likePost(postId);
    setLikedPosts((prevLiked) => ({
      ...prevLiked,
      [postId]: !prevLiked[postId],
    }));
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
        const visibleItem = viewableItems[0];
        setVisibleVideoIndex(visibleItem.index);
      } else {
        setVisibleVideoIndex(null);
      }
    }
  ).current;

  const renderPostItem = ({
    item,
    index,
  }: {
    item: PostItem;
    index: number;
  }) => {
    const user = usersData[item.user_id];
    const isLiked = likedPosts[item.post_id] ?? false;
    const isExpanded = expandedPosts[item.post_id] ?? false;
    const currentIndex = currentIndices[item.post_id] ?? 0;
    const truncatedText =
      item.about.length > 100 ? item.about.slice(0, 100) + "..." : item.about;

    return (
      <View key={item.post_id} style={styles.post}>
        <View style={styles.userInfo}>
          {user && (
            <>
              <FastImage source={{ uri: user.avatar }} style={styles.avatar} />
              <View style={styles.userMetaInfo}>
                <View style={styles.usernameRow}>
                  <Text style={styles.username}>{user.username}</Text>
                  {user.official && (
                    <MaterialIcons name="check-circle" size={12} color="#58a6ff" />
                  )}
                  {item.is_ai_generated && (
                    <View style={styles.aiBadge}>
                      <MaterialIcons name="auto-awesome" size={12} color="#fff" />
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  )}
                </View>
                {item.location?.trim() ? (
                  <Text style={styles.location}>{item.location}</Text>
                ) : null}
              </View>
            </>
          )}
        </View>

        {item.media.length === 1 ? (
          <MediaItemComponent
            item={item.media[0]}
            isVisible={index === visibleVideoIndex}
          />
        ) : (
          <View style={{ position: "relative" }}>
            <FlatList
              data={item.media}
              renderItem={({ item: mediaItem }) => (
                <MediaItemComponent
                  item={mediaItem}
                  isVisible={index === visibleVideoIndex}
                />
              )}
              keyExtractor={(mediaItem) => mediaItem.id.toString()}
              horizontal
              pagingEnabled
              nestedScrollEnabled={true}
              showsHorizontalScrollIndicator={false}
              onScroll={(event) => handleScroll(event, item.post_id)}
            />
            <View style={styles.pageIndicator}>
              <Text style={styles.pageIndicatortText}>
                {currentIndex + 1}/{item.media.length}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => toggleLike(item.post_id)}
            style={{ flexDirection: "row" }}
          >
            <Icon
              name={isLiked ? "heart" : "heart-outline"}
              size={24}
              color={isLiked ? "red" : styles.iconColor.color}
            />
            <Text
              style={{
                color: isDarkMode ? "white" : "black",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              {item.count_likes > 0 ? formatNumber(item.count_likes) : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity>
            <Icon
              name="chatbubble-outline"
              size={24}
              color={styles.iconColor.color}
              onPress={() => {
                setPopupPostId(item.post_id);
                setShowPopup(true);
              }}
            />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Text style={styles.text}>
            {isExpanded ? item.about : truncatedText}
          </Text>
          {item.about.length > 100 && (
            <TouchableOpacity onPress={() => toggleExpand(item.post_id)}>
              <Text style={styles.readMore}>
                {isExpanded ? "Show less" : "Read more"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.timeAgo}>{timeAgo(item.create_at)}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { flex: 1 }]}>
      {showPopup && (
        <PopupModal
          post_id={popupPostId as number}
          onClose={() => setShowPopup(false)}
        />
      )}
      <View style={{ flexDirection: "row", marginLeft: -10 }}>
        <MaterialIcons
          name="keyboard-arrow-left"
          style={[styles.text, { fontSize: 42, width: 50 }]}
          onPress={() =>
            router.push({ pathname: previous, params: { id: user_id } })
          }
        />
        <Text style={[styles.text, { fontSize: 28 }]}>Posts</Text>
      </View>
      <StatusBar animated backgroundColor={isDarkMode ? "#0A0410" : "#f0f0f0"} />
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        ref={flatListRef}
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.post_id.toString()}
        initialScrollIndex={posts.findIndex(
          (item) => item.post_id === TARGET_ID
        )}
        getItemLayout={(data, index) => ({
          length: 500,
          offset: 500 * index,
          index,
        })}
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchPosts()}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 100,
        }}
        style={{ flex: 1 }}
      />
    </View>
  );
};

const MediaItemComponent = ({
  item,
  isVisible,
}: {
  item: MediaItem;
  isVisible: boolean;
}) => {
  const mediaUrl = `${GetApiUrl().slice(0, 25)}/media/${item.media_url}`;
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<Video>(null);
  const styles = getStyles(useColorScheme() === "dark");

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  useFocusEffect(
    useCallback(() => {
      if (item.type === "video") {
        if (isVisible) {
          videoRef.current?.playAsync();
        } else {
          videoRef.current?.pauseAsync();
          videoRef.current?.setPositionAsync(0);
        }
      }
    }, [isVisible])
  );

  return mediaUrl.match(/\.(mp4|webm|ogg|mov|mkv)$/) ? (
    <View>
      <Video
        ref={videoRef}
        source={{ uri: mediaUrl }}
        style={styles.fullMedia}
        useNativeControls={false}
        isLooping
        shouldPlay={isVisible}
        resizeMode={"cover" as ResizeMode}
        volume={isMuted ? 0 : 1}
      />
      <TouchableOpacity onPress={() => toggleMute()} style={styles.muteButton}>
        <MaterialIcons
          name={isMuted ? "volume-off" : "volume-up"}
          size={24}
          color="white"
        />
      </TouchableOpacity>
    </View>
  ) : (
    <FastImage
      source={{ uri: mediaUrl }}
      style={styles.fullMedia}
      resizeMode="cover"
    />
  );
};

const getStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      padding: 10,
      backgroundColor: isDarkMode ? "#0A0410" : "#fff",
      flex: 1,
    },
    location: {
        fontSize: 14,
        color: isDarkMode ? "#aaa" : "#666",
        marginTop: 2
    },
    userInfo: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 10,
    },
    username: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDarkMode ? "#ddd" : "#333",
    },
    post: {
      width: screenWidth,
      paddingBottom: 15,
      paddingTop: 15,
      backgroundColor: isDarkMode ? "#0A0410" : "#fff",
      elevation: 3,
    },
    fullMedia: {
      width: screenWidth,
      height: screenWidth * 1,
      borderRadius: 12,
    },
    text: {
      width: screenWidth - 10,
      fontSize: 16,
      marginBottom: 10,
      paddingHorizontal: 10,
      color: isDarkMode ? "#ddd" : "#333",
    },
    readMore: {
      fontSize: 14,
      color: "#007bff",
      textAlign: "center",
      marginBottom: 10,
      marginLeft: 10,
    },
    timeAgo: {
      fontSize: 14,
      color: isDarkMode ? "#bbb" : "gray",
      paddingHorizontal: 10,
      paddingTop: 5,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    iconColor: {
      color: isDarkMode ? "#bbb" : "black",
    },
    button: {
      backgroundColor: "#007bff",
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 5,
      marginTop: 15,
    },
    buttonText: {
      color: "white",
      fontSize: 16,
    },
    error: {
      color: "red",
      textAlign: "center",
      marginBottom: 10,
    },
    pageIndicator: {
      position: "absolute",
      right: "7%",
      textAlign: "center",
      marginTop: 5,
      fontSize: 16,
      color: "white",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      padding: 5,
      borderRadius: 10,
    },
    pageIndicatortText: {
      color: "white",
    },
    muteButton: {
      position: "absolute",
      bottom: 5,
      right: 25,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      padding: 5,
      borderRadius: 10,
    },
    userMetaInfo: {
      flex: 1,
    },
    usernameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#05f0d8',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 12,
      marginLeft: 4,
    },
    aiBadgeText: {
      color: '#000',
      fontSize: 10,
      fontWeight: 'bold',
      marginLeft: 2,
    },
  });

export default UserPosts;
