import React, { useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Heart } from "lucide-react-native";

const { width: SW } = Dimensions.get("window");

export interface PostMedia {
    id: number;
    media_url: string;
    media_preview?: string | null;
}

export const getMediaUrls = (item: PostMedia) => ({
    hd: item.media_url,
    isVideo: false,
});

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
    const { hd } = getMediaUrls(item);
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
                if (tapCount.current === 1) onOpenPhoto();
                tapCount.current = 0;
            }, 250);
        }
    };

    return (
        <TouchableOpacity onPress={handlePress} style={styles.container} activeOpacity={0.6}>
            <Image
                source={{ uri: hd }}
                style={styles.media}
                contentFit="cover"
            />

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