import React, { useEffect, useState } from "react";
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import getMenuPosts from "@/src/api/menu.posts";
import GetApiUrl from "@/src/utils/url_api";

const screenWidth = Dimensions.get("window").width;
const padding = 25;
const imageSize = (screenWidth - padding * 2) / 3; 

const PostGallery = () => {
    const [posts, setPosts] = useState<any[]>([]);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await getMenuPosts();
                setPosts(response.data);
            } catch (error) {
                console.error("Error fetching posts:", error);
            }
        };

        fetchPosts();
    }, []);

    const isVideo = (url: string) => {
        return url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".avi");
    };

    return (
        <View style={styles.container}>
            {posts.length === 0 ? (
                <Text style={styles.noPostsText}>No posts available</Text>
            ) : (
                <FlatList
                    data={posts.reverse()}
                    keyExtractor={(item) => item.post_id?.toString() || Math.random().toString()}
                    numColumns={3}
                    contentContainerStyle={{ flexGrow: 1 }} 
                    renderItem={({ item }) => {
                        if (!item.media?.media_url) {
                            console.warn("❌ Media URL is missing for post:", item);
                            return null;
                        }

                        const mediaUrl = `${GetApiUrl().slice(0, 25)}/media/${item.media.media_url}`;

                        return (
                            <TouchableOpacity style={styles.postContainer}>
                                {isVideo(mediaUrl) ? (
                                    <View style={styles.videoPlaceholder}>
                                        <Image 
                                            source={{ uri: mediaUrl }}
                                            style={styles.media}
                                            resizeMode="contain"
                                        />
                                        <Ionicons 
                                            name="play-circle" 
                                            size={32} 
                                            color="white" 
                                            style={styles.videoIcon} 
                                        />
                                    </View>
                                ) : (
                                    <Image 
                                        source={{ uri: mediaUrl }}
                                        style={styles.media}
                                        resizeMode="cover"
                                        onError={() => console.error("❌ Failed to load image:", mediaUrl)}
                                    />
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        
    },
    postContainer: {
        width: imageSize,
        height: imageSize,
        margin: 2,
        backgroundColor: "#222",
    },
    media: {
        width: "100%",
        height: "100%",
    },
    videoPlaceholder: {
        position: "relative",
    },
    videoIcon: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: [{ translateX: -16 }, { translateY: -16 }],
    },
    noPostsText: {
        color: "white",
        textAlign: "center",
        fontSize: 18,
        marginTop: 20,
    },
});

export default PostGallery;
