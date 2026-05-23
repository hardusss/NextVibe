import React, { useRef, useState } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, TouchableOpacity } from "react-native";
import { Video, ResizeMode } from "expo-av";
import FastImage from "react-native-fast-image";
import { Heart, Volume2, VolumeX } from "lucide-react-native";

const { width: SW } = Dimensions.get("window");

export interface PostMedia {
    id: number;
    media_url: string;
    media_preview?: string | null;
}

const isVideo = (url: string) =>
    url.includes("/video/") ||
    [".mp4", ".mov", ".avi", ".mkv", ".webm"].some((e) => url.toLowerCase().endsWith(e));

export const getMediaUrls = (item: PostMedia) => {
    if (!isVideo(item.media_url)) return { hd: item.media_url, isVideo: false };
    return { hd: item.media_url, isVideo: true };
};

interface Props {
    item: PostMedia;
    isLiked: boolean;
    onLike: () => void;
    onOpenPhoto: () => void;
}

/**
 * Disambiguates single-tap (open photo) from double-tap (like) using a short timer:
 * - Each tap increments a counter and resets the 250 ms timeout.
 * - If the counter hits 2 before the timeout fires → double-tap → like + heart animation.
 * - If the timeout fires with counter === 1 → single-tap → open full-screen (images only).
 */
const PostMediaItem: React.FC<Props> = ({ item, isLiked, onLike, onOpenPhoto }) => {
    const { hd, isVideo: video } = getMediaUrls(item);
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const tapCount = useRef(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const animateHeart = () => {
        setShowHeart(true);
        Animated.sequence([
            Animated.spring(heartAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
            Animated.delay(500),
            Animated.timing(heartAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => { setShowHeart(false); heartAnim.setValue(0); });
    };

    const handlePress = () => {
        tapCount.current += 1;
        if (tapTimer.current) clearTimeout(tapTimer.current);

        if (tapCount.current >= 2) {
            animateHeart();
            if (!isLiked) onLike();
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => {
                if (tapCount.current === 1 && !video) onOpenPhoto();
                tapCount.current = 0;
            }, 250);
        }
    };

    return (
        <TouchableOpacity onPress={handlePress} style={styles.container} activeOpacity={0.6}>
            {video ? (
                <>
                    <Video
                        source={{ uri: hd }}
                        style={styles.media}
                        resizeMode={ResizeMode.COVER}
                        isLooping
                        isMuted={isMuted}
                        shouldPlay
                    />
                    <Pressable
                        onPress={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }}
                        style={styles.muteBtn}
                    >
                        {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
                    </Pressable>
                </>
            ) : (
                <FastImage
                    source={{ uri: item.media_url, priority: FastImage.priority.high }}
                    style={styles.media}
                    resizeMode={FastImage.resizeMode.cover}
                />
            )}

            {showHeart && (
                <Animated.View
                    style={[styles.heartOverlay, { transform: [{ scale: heartAnim }], opacity: heartAnim }]}
                    pointerEvents="none"
                >
                    <Heart size={80} color="#A855F7" fill="#A855F7" />
                </Animated.View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: { 
        width: SW - 32, 
        aspectRatio: 1, 
        backgroundColor: "#111", 
        overflow: "hidden" 
    },
    media: { 
        width: "100%", 
        height: "100%" 
    },
    muteBtn: {
        position: "absolute", 
        bottom: 14, 
        right: 14, 
        zIndex: 20,
        backgroundColor: "rgba(0,0,0,0.55)", 
        padding: 7, 
        borderRadius: 18,
    },
    heartOverlay: {
        position: "absolute", 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        justifyContent: "center", 
        alignItems: "center", 
        zIndex: 15,
    },
});

export default PostMediaItem;