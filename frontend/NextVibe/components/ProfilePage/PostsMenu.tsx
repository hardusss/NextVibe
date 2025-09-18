import React, { useState } from "react";
import { 
    View, 
    Image, 
    FlatList, 
    TouchableOpacity, 
    StyleSheet, 
    Dimensions, 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator } from "../CustomActivityIndicator";
import { Video } from "expo-av";
import getMenuPosts from "@/src/api/menu.posts";
import GetApiUrl from "@/src/utils/url_api";
import { useRouter } from "expo-router";
import { ResizeMode } from "expo-av";

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import FastImage from 'react-native-fast-image';
import { MaterialIcons } from "@expo/vector-icons";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3; 

interface Post {
    post_id: number;
    media: { media_url: string }[];
    is_ai_generated: boolean;
}

const PostGallery = ({id, previous}: {id: number, previous: string}) => {
    const router = useRouter();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true); 
    const [index, setIndex] = useState(0);

    const fetchPosts = async (shouldLoadMore = false) => {
        if (loadingMore || !hasMore) return;
    
        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);
    
        try {
            const response = await getMenuPosts(id);
            const newPosts = response.data;
    
            setHasMore(newPosts.more_posts)
    
            setPosts((prevPosts) => {
                const uniquePosts = new Map(prevPosts.map(post => [post.post_id, post]));
                newPosts.forEach((post: any) => uniquePosts.set(post.post_id, post));
                return Array.from(uniquePosts.values());
            });
            
            setIndex((prevIndex: number) => prevIndex + newPosts.length);
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

    const isVideo = (url: string) => {
        return url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".avi");
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
                    initialNumToRender={10}
                    contentContainerStyle={{ flexGrow: 1,  paddingBottom: 250 }}
                    renderItem={({ item }) => {
                        if (!Array.isArray(item.media) || item.media.length === 0 || !item.media[0]?.media_url) {
                            console.warn("❌ Media URL is missing for post:", item);
                            return null;
                        }
                    
                        const mediaUrl = `${GetApiUrl().slice(0, 25)}/media/${item.media[0].media_url}`;
                        const isMediaVideo = isVideo(mediaUrl);
                    
                        return (
                            <TouchableOpacity 
                                style={styles.postContainer} 
                                onPress={() => router.push({pathname: "/postslist", params: {id: item.post_id, previous: previous, user_id: id}})}
                            >
                                {isMediaVideo ? (
                                    <View style={styles.videoContainer}>
                                        <Video 
                                            source={{ uri: mediaUrl }}
                                            style={styles.media}
                                            shouldPlay={false}
                                            isLooping={false}
                                            useNativeControls={false} 
                                            resizeMode={"cover" as ResizeMode}
                                        />
                                    </View>
                                ) : (
                                    <FastImage 
                                        source={{ uri: mediaUrl }}
                                        style={[styles.media]}
                                        resizeMode={FastImage.resizeMode.cover}
                                        onError={() => console.error("❌ Failed to load image:", mediaUrl)}
                                    />
                                )}
                    
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
                            </TouchableOpacity>
                        );
                    }}
                    onEndReached={() => fetchPosts(true)} 
                    onEndReachedThreshold={0.5}
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
    },
    media: {
        width: "100%",
        height: "100%",
        borderRadius: 10
    },
    videoContainer: {
        position: "relative",
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
