import React, { useState } from "react";
import { 
    View, 
    FlatList, 
    TouchableOpacity, 
    StyleSheet, 
    Dimensions, 
    Text
} from "react-native";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getMenuPosts from "@/src/api/menu.posts";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BlurView } from "@react-native-community/blur";
import FastImage from 'react-native-fast-image';
import { Image, Video, Timer, Sparkles } from "lucide-react-native";
import { storage } from '@/src/utils/storage';
import PostPopup from "./PostModal";
import PopupModal from "../Comments/CommentPopup";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3; 

interface Post {
    user_id: number;
    post_id: number;
    media: { media_url: string, media_preview: string | null }[] | null;
    is_ai_generated: boolean;
    moderation_status: string;
}

type MediaCheck = 
    | { storage: string; is_video: true }
    | false;

const PostGallery = ({id, previous}: {id: number, previous: string}) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true); 
    const [index, setIndex] = useState(0);
    const [userID, setUserID] = useState<number | null>(null);

    // Popup state
    const [popupVisible, setPopupVisible] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
    const [commentsPostId, setCommentsPostId] = useState<number | null>(null);

    const POSTS_PER_PAGE = 9;

    const getId = async () => {
        const storedId = await storage.getItem("id");
        const parsedId = Number(storedId);
        setUserID(parsedId);
        return parsedId;
    };

    const fetchPosts = async (shouldLoadMore = false, currentUserID?: number) => {
        if (loadingMore || !hasMore) return;
    
        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);
    
        try {
            const response = await getMenuPosts(id, index, POSTS_PER_PAGE);
            const newPosts = response.data;
            setHasMore(response.more_posts);
    
            setPosts((prevPosts) => {
                const actualUserID = currentUserID ?? userID;
                
                const filteredNewPosts = newPosts.filter(
                    (p: any) =>
                        p.moderation_status === "approved" || 
                        (p.moderation_status === "pending" && p.user_id === actualUserID)
                );

                if (shouldLoadMore) {
                    const uniquePosts = new Map(prevPosts.map(post => [post.post_id, post]));
                    filteredNewPosts.forEach((post: any) => uniquePosts.set(post.post_id, post));
                    return Array.from(uniquePosts.values());
                } else {
                    return filteredNewPosts;
                }
            });

            setIndex((prevIndex) => shouldLoadMore ? prevIndex + POSTS_PER_PAGE : POSTS_PER_PAGE);
        } catch (error) {}
    
        setLoading(false);
        setLoadingMore(false);
    };

    useFocusEffect(
        useCallback(() => {
            setPosts([]);
            setIndex(0);
            
            getId().then((fetchedUserID) => {
                fetchPosts(false, fetchedUserID);
            });
        }, [])
    );

    const isVideo = (url: string): MediaCheck => {
        if (url.includes("/video/")) {
            return { storage: "cloudinary", is_video: true };
        }
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        if (videoExtensions.some(ext => url.endsWith(ext))) {
            return { storage: "r2", is_video: true };
        }
        return false; 
    };

    const getPreviewUrl = (url: string, item: any): string => {
        const videoCheck = isVideo(url);
        if (videoCheck) {
            if (videoCheck.storage === "cloudinary") {
                return url.replace("/video/upload/", "/video/upload/so_0,du_1,q_10,f_jpg/");
            }
            if (videoCheck.storage === "r2") {
                return item?.media[0]?.media_preview || item?.preview || url;
            }
        }
        return url;
    };

    const handlePostPress = (item: Post) => {
        if (item.moderation_status !== "approved") return;
        setSelectedPostId(item.post_id);
        setPopupVisible(true);
    };

    return (
        <View style={styles.container}>
            {/* PostPopup — renders as Modal above everything */}
            <PostPopup
                visible={popupVisible}
                postId={selectedPostId}
                onClose={() => setPopupVisible(false)}
                currentUserId={userID ?? undefined}
                onOpenComments={(id) => setCommentsPostId(id)}
            />

            {/* CommentsSheet lives OUTSIDE Modal — BottomSheetModal can't nest inside Modal */}
            {commentsPostId !== null && (
                <PopupModal
                    post_id={commentsPostId}
                    onClose={() => setCommentsPostId(null)}
                    isCommentsEnabled={true}
                />
            )}

            {loading ? ( 
                <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.post_id?.toString() || Math.random().toString()}
                    numColumns={3}
                    nestedScrollEnabled={true}
                    scrollEnabled={false}
                    initialNumToRender={3}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                    renderItem={({ item }) => {
                        const hasMedia = item.media && Array.isArray(item.media) && item.media.length > 0 && item.media[0]?.media_url;
                        const isMediaVideo = hasMedia && item.media ? isVideo(item.media[0].media_url) : false;
                        const mediaUrl = hasMedia && item.media ? item.media[0].media_url : null;
                        const isApproved = item.moderation_status === "approved";
                        const isPending = item.moderation_status === "pending" && item.user_id === userID;

                        return (
                            <TouchableOpacity
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                                style={styles.postContainer} 
                                onPress={() => isApproved ? handlePostPress(item) : null}
                                activeOpacity={isApproved ? 0.75 : 1}
                            >
                                {hasMedia ? (
                                    isMediaVideo ? (
                                        <View style={styles.videoContainer}>
                                            <FastImage 
                                                source={{ uri: getPreviewUrl(mediaUrl!, item) }}
                                                style={styles.media}
                                                resizeMode={FastImage.resizeMode.cover}
                                            />
                                        </View>
                                    ) : (
                                        <FastImage 
                                            source={{ uri: mediaUrl! }}
                                            style={styles.media}
                                            resizeMode={FastImage.resizeMode.cover}
                                        />
                                    )
                                ) : (
                                    <View style={styles.placeholderContainer}>
                                        <Image size={40} color="#666" />
                                    </View>
                                )}
                    
                                {isPending && (
                                    <BlurView 
                                        style={styles.moderationStatus} 
                                        blurType="dark"   
                                        blurAmount={10}    
                                    >
                                        <View style={styles.moderationContent}>
                                            <Timer size={28} color="white" style={{ alignSelf: "center" }} />
                                            <Text style={styles.moderationText}>Post on Moderation</Text>
                                        </View>
                                    </BlurView>
                                )}

                                {hasMedia && isApproved && (
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconRow}>
                                            {isMediaVideo
                                                ? <Video size={16} color="white" />
                                                : <Image size={16} color="white" />
                                            }
                                            {item.is_ai_generated && (
                                                <Sparkles size={16} color="#05f0d8" />
                                            )}
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    onEndReached={() => fetchPosts(true)} 
                    onEndReachedThreshold={1}
                    ListFooterComponent={
                        loadingMore
                            ? <ActivityIndicator size="small" color="#0000ff" style={{ marginVertical: 10 }} />
                            : null
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    postContainer: {
        width: imageSize,
        height: imageSize,
        margin: 2,
        position: "relative",
        overflow: "hidden", 
        borderRadius: 10,
        backgroundColor: "#1a1a1a",
    },
    placeholderContainer: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#2a2a2a",
        borderRadius: 10,
    },
    moderationStatus: {
        position: "absolute",
        width: "100%",
        height: "100%",
        zIndex: 9999,
        borderRadius: 10,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    moderationContent: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    moderationText: {
        color: "white",
        fontSize: 11,
        textAlign: "center",
        fontFamily: "Dank Mono Bold",
    includeFontPadding: false,
        lineHeight: 14,
        letterSpacing: 0.5,
    },
    media: {
        width: "100%",
        height: "100%",
        borderRadius: 10
    },
    videoContainer: {
        position: "relative",
    width: "100%",
        height: "100%",
    },
    iconContainer: {
        position: "absolute",
        top: 5,
        right: 5,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: 10,
        padding: 5,
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
});

export default PostGallery;