import React, { useEffect, useState } from "react";
import {
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { ImageZoom } from "@likashefqet/react-native-image-zoom";
import { X } from "lucide-react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const { width: SW, height: SH } = Dimensions.get("window");

export interface PostMedia {
    id: number;
    media_url: string;
    media_preview?: string | null;
}

const isVideo = (url: string) =>
    url.includes("/video/") ||
    [".mp4", ".mov", ".avi", ".mkv", ".webm"].some((e) => url.toLowerCase().endsWith(e));

interface Props {
    visible: boolean;
    images: PostMedia[];
    initialIndex: number;
    onClose: () => void;
}

/**
 * Zoom vs. swipe conflict resolution:
 * FlatList handles horizontal paging; ImageZoom handles pinch/double-tap.
 * We disable FlatList scrolling on pinch start and re-enable it only after
 * the zoom animation fully resets to 1x — matching the Instagram UX where
 * you must zoom out before swiping to the next image.
 */
const PhotoModal: React.FC<Props> = ({ visible, images, initialIndex, onClose }) => {
    const [current, setCurrent] = useState(initialIndex);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    useEffect(() => {
        if (visible) {
            setCurrent(initialIndex);
            setScrollEnabled(true);
        }
    }, [visible, initialIndex]);

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>

                <Pressable onPress={onClose} style={styles.closeBtn}>
                    <X size={20} color="#fff" />
                </Pressable>

                {images.length > 1 && (
                    <View style={styles.counter}>
                        <Text style={styles.counterText}>{current + 1} / {images.length}</Text>
                    </View>
                )}

                <FlatList
                    data={images}
                    horizontal
                    pagingEnabled
                    scrollEnabled={scrollEnabled}
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={initialIndex}
                    getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
                    onMomentumScrollEnd={(e) =>
                        setCurrent(Math.round(e.nativeEvent.contentOffset.x / SW))
                    }
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => {
                        if (isVideo(item.media_url)) {
                            return (
                                <View style={styles.slide}>
                                    <Video
                                        source={{ uri: item.media_url }}
                                        style={{ width: SW, height: SW }}
                                        resizeMode={ResizeMode.CONTAIN}
                                        isLooping
                                        shouldPlay
                                    />
                                </View>
                            );
                        }
                        return (
                            <View style={styles.slide}>
                                <ImageZoom
                                    uri={item.media_url}
                                    minScale={1}
                                    maxScale={6}
                                    isDoubleTapEnabled
                                    style={{ width: SW, height: SH }}
                                    resizeMode="contain"
                                    onPinchStart={() => setScrollEnabled(false)}
                                    onResetAnimationEnd={() => setScrollEnabled(true)}
                                />
                            </View>
                        );
                    }}
                />
            </GestureHandlerRootView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    closeBtn: {
        position: "absolute", 
        top: 52, 
        right: 20, 
        zIndex: 99,
        padding: 8, 
        backgroundColor: "rgba(255,255,255,0.12)", 
        borderRadius: 20,
    },
    counter: {
        position: "absolute", 
        top: 56, 
        alignSelf: "center", 
        zIndex: 99,
        backgroundColor: "rgba(0,0,0,0.55)", 
        paddingHorizontal: 12, 
        paddingVertical: 5, 
        borderRadius: 12,
    },
    counterText: { 
        color: "#fff", 
        fontSize: 13 
    },
    slide: { 
        width: SW, 
        height: SH, 
        justifyContent: "center"
     },
});

export default PhotoModal;