import React, { useState } from "react";
import { 
    View, 
    FlatList, 
    TouchableOpacity, 
    StyleSheet, 
    Dimensions, 
    Text
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getMenuPosts from "@/src/api/menu.posts";
import { useRouter } from "expo-router";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BlurView } from "@react-native-community/blur";
import FastImage from 'react-native-fast-image';
import { MaterialIcons } from "@expo/vector-icons";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3; 

interface Post {
    post_id: number;
    media: { media_url: string, media_preview: string | null }[] | null;
    is_ai_generated: boolean;
    moderation_status: string;
}

type MediaCheck = 
    | { storage: string; is_video: true }
    | false;

const PostGallery = ({id, previous}: {id: number, previous: string}) => {
    const router = useRouter();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true); 
    const [index, setIndex] = useState(0);

    const POSTS_PER_PAGE = 9;

    const fetchPosts = async (shouldLoadMore = false) => {
        if (loadingMore || !hasMore) return;
    
        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);
    
        try {
            const response = await getMenuPosts(id, index, POSTS_PER_PAGE);
            const newPosts = response.data;
    
            setHasMore(response.more_posts);
    
            setPosts((prevPosts) => {
                if (shouldLoadMore) {
                    // Append new posts
                    const uniquePosts = new Map(prevPosts.map(post => [post.post_id, post]));
                    newPosts.forEach((post: any) => uniquePosts.set(post.post_id, post));
                    return Array.from(uniquePosts.values());
                } else {
                    // Replace all posts
                    return newPosts;
                }
            });
            
            setIndex((prevIndex) => shouldLoadMore ? prevIndex + POSTS_PER_PAGE : POSTS_PER_PAGE);
        } catch (error) {
            console.error("❌ Error fetching posts:", error);
        }
    
        setLoading(false);
        setLoadingMore(false);
    };

    useFocusEffect(
        useCallback(() => {
            setPosts([]);
            setIndex(0);
            fetchPosts();
        }, [])
    );


    const isVideo = (url: string): MediaCheck => {
        if (url.includes("/video/")) {
            return {
                storage: "cloudinary",
                is_video: true
            };
        }

        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        if (videoExtensions.some(ext => url.endsWith(ext))) {
            return {
                storage: "r2",
                is_video: true
            };
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


    return (
        <View style={styles.container}>
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
                        return (
                            <TouchableOpacity 
                                style={styles.postContainer} 
                                onPress={() => item.moderation_status === "approved" && hasMedia ? router.push({pathname: "/postslist", params: {id: item.post_id, previous: previous, user_id: id}}) : null}
                                activeOpacity={item.moderation_status === "approved" && hasMedia ? 0.7 : 1}
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
                                            style={[styles.media]}
                                            resizeMode={FastImage.resizeMode.cover}
                                            onError={() => console.error("❌ Failed to load image:", mediaUrl)}
                                        />
                                    )
                                ) : (
                                    <View style={styles.placeholderContainer}>
                                        <Ionicons name="images-outline" size={40} color="#666" />
                                    </View>
                                )}
                    
                                {item.moderation_status === "pending" && (
                                    <BlurView 
                                        style={styles.moderationStatus} 
                                        blurType="dark"   
                                        blurAmount={10}    
                                    >
                                        <View style={styles.moderationContent}>
                                            <MaterialIcons name="timer" size={28} color="white" style={{
                                                alignSelf: "center",
                                                textAlign: "center",
                                                verticalAlign: "middle",
                                                paddingBottom: "20%",
                                            }}/>
                                            <Text style={styles.moderationText}>
                                                Post on Moderation
                                            </Text>
                                        </View>
                                    </BlurView>
                                )}

                                {hasMedia && item.moderation_status === "approved" && (
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconRow}>
                                            <Ionicons 
                                                name={isMediaVideo ? "videocam" : "image"} 
                                                size={20} 
                                                color="white" 
                                            />
                                            {item.is_ai_generated && (
                                                <MaterialIcons name="auto-awesome" size={20} color="#05f0d8" />
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
                        loadingMore ? <ActivityIndicator size="small" color="#0000ff" style={{ marginVertical: 10 }} /> : null
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
        paddingTop: "20%",
        color: "white",
        fontSize: 11,
        textAlign: "center",
        fontWeight: "600",
        lineHeight: 14,
        letterSpacing: 0.5,
        textShadowColor: "rgba(0, 0, 0, 0.75)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
        alignSelf: "center",
        verticalAlign: "middle"
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
        gap: 8,
    },
    noPostsText: {
        color: "white",
        textAlign: "center",
        fontSize: 18,
        marginTop: 20,
    },
});

export default PostGallery;