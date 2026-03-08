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
import getCollectionsMenu from "@/src/api/get.collections.menu";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import FastImage from 'react-native-fast-image';
import { Image, Video, Sparkles, Gem } from "lucide-react-native";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3;

interface PostMedia {
    media_url: string;
    media_preview: string | null;
}

interface CollectionItem {
    user_id: number;
    post_id: number;
    media: PostMedia[] | null;
    is_ai_generated: boolean;
    is_nft: boolean;
    moderation_status: string;
    edition: number;
    price: string;
    asset_id: string;
    minted_at: string;
}

type MediaCheck =
    | { storage: string; is_video: true }
    | false;

interface CollectionsGalleryProps {
    id: number;
}

const CollectionsGallery = ({ id }: CollectionsGalleryProps) => {
    const [items, setItems] = useState<CollectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [index, setIndex] = useState(0);

    const POSTS_PER_PAGE = 9;

    const fetchItems = async (shouldLoadMore = false) => {
        if (loadingMore || !hasMore) return;

        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const response = await getCollectionsMenu(id, index, POSTS_PER_PAGE);
            const newItems = response.data;
            setHasMore(response.more_posts);

            setItems((prev) => {
                if (shouldLoadMore) {
                    const unique = new Map(prev.map(item => [item.post_id, item]));
                    newItems.forEach((item: any) => unique.set(item.post_id, item));
                    return Array.from(unique.values());
                } else {
                    return newItems;
                }
            });

            setIndex((prev) => shouldLoadMore ? prev + POSTS_PER_PAGE : POSTS_PER_PAGE);
        } catch (error) { }

        setLoading(false);
        setLoadingMore(false);
    };

    useFocusEffect(
        useCallback(() => {
            setItems([]);
            setIndex(0);
            setHasMore(true);
            fetchItems(false);
        }, [])
    );

    const isVideo = (url: string): MediaCheck => {
        if (url.includes("/video/")) return { storage: "cloudinary", is_video: true };
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        if (videoExtensions.some(ext => url.endsWith(ext))) return { storage: "r2", is_video: true };
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
                    data={items}
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
                                activeOpacity={1}
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

                                {hasMedia && (
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconRow}>
                                            {isMediaVideo
                                                ? <Video size={16} color="white" />
                                                : <Image size={16} color="white" />
                                            }
                                            {item.is_ai_generated && (
                                                <Sparkles size={16} color="#05f0d8" />
                                            )}
                                            {item.is_nft && (
                                                <Gem size={16} color="#a78bfa" />
                                            )}
                                        </View>
                                    </View>
                                )}

                                <View style={styles.editionBadge}>
                                    <Text style={styles.editionText}>#{item.edition}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    onEndReached={() => fetchItems(true)}
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
    media: {
        width: "100%",
        height: "100%",
        borderRadius: 10,
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
    editionBadge: {
        position: "absolute",
        bottom: 5,
        left: 5,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    editionText: {
        color: "#a78bfa",
        fontSize: 10,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
});

export default CollectionsGallery;