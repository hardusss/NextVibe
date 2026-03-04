import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Animated,
    ScrollView,
    Pressable,
} from "react-native";
import FastImage from "react-native-fast-image";
import { BlurView } from "@react-native-community/blur";
import {
    Sparkles,
    MapPin,
    Calendar,
    MessageCircle,
    Heart,
    X,
    Image as ImageIcon,
} from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import getPost from "@/src/api/get.post";
import likePost from "@/src/api/like.post";
import DropDown from "../Shared/Posts/PostsDropdown";
import VerifyBadge from "../VerifyBadge";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_HORIZONTAL_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2;
const IMAGE_HEIGHT = CARD_WIDTH * 1.25;

interface PostMedia {
    id: number;
    media_url: string;
}

interface PostData {
    user_id: number;
    post_id: number;
    username: string;
    avatar: string | null;
    official: boolean;
    about: string;
    count_likes: number;
    media: PostMedia[];
    create_at: string;
    is_ai_generated: boolean;
    location: string | null;
    moderation_status: string;
    is_comments_enabled: boolean;
    liked_posts: number[];
    comments_count: number;
}

interface PostPopupProps {
    visible: boolean;
    postId: number | null;
    onClose: () => void;
    currentUserId?: number;
    onOpenComments?: (postId: number) => void;
}

const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const PostPopup: React.FC<PostPopupProps> = ({ visible, postId, onClose, currentUserId, onOpenComments }) => {
    const [post, setPost] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(false);
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [showHeart, setShowHeart] = useState(false);

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const heartScale = useRef(new Animated.Value(1)).current;
    // Big heart overlay animation (like in PostList)
    const heartOverlayAnim = useRef(new Animated.Value(0)).current;
    // For double tap detection
    const tapCount = useRef(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 65,
                friction: 11,
                useNativeDriver: true,
            }).start();

            if (postId !== null) {
                let cancelled = false;
                setLoading(true);
                setPost(null);
                setLiked(false);
                setDropdownVisible(false);

                getPost(postId)
                    .then((response) => {
                        if (cancelled) return;
                        if (response?.data) {
                            setPost(response.data);
                            setLikeCount(response.data.count_likes);
                            setLiked(response.data.liked_posts?.includes(response.data.post_id) ?? false);
                        }
                    })
                    .catch((err) => console.error("fetchPost error:", err))
                    .finally(() => { if (!cancelled) setLoading(false); });

                return () => { cancelled = true; };
            }
        } else {
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 250,
                useNativeDriver: true,
            }).start();
            setDropdownVisible(false);
            // closed via onDismiss;
        }
    }, [visible, postId]);

    // Cleanup tap timer
    useEffect(() => {
        return () => {
            if (tapTimer.current) clearTimeout(tapTimer.current);
        };
    }, []);

    const animateHeartOverlay = () => {
        setShowHeart(true);
        Animated.sequence([
            Animated.spring(heartOverlayAnim, {
                toValue: 1,
                friction: 3,
                useNativeDriver: true,
            }),
            Animated.delay(500),
            Animated.timing(heartOverlayAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setShowHeart(false);
            heartOverlayAnim.setValue(0);
        });
    };

    const handleDoubleTap = () => {
        tapCount.current += 1;

        if (tapTimer.current) clearTimeout(tapTimer.current);

        if (tapCount.current === 2) {
            animateHeartOverlay();
            if (!liked) handleLike();
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => {
                tapCount.current = 0;
            }, 300);
        }
    };

    const handleLike = () => {
        if (!post) return;
        likePost(post.post_id);
        // Bottom bar heart animation
        Animated.sequence([
            Animated.spring(heartScale, { toValue: 1.4, tension: 300, friction: 5, useNativeDriver: true }),
            Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 5, useNativeDriver: true }),
        ]).start();
        setLiked((prev) => !prev);
        setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    };

    const mediaUrl = post?.media?.[0]?.media_url ?? null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            {/* Backdrop */}
            <TouchableOpacity
                style={styles.backdrop}
                onPress={onClose}
                activeOpacity={1}
            />

            {/* Card */}
            <Animated.View
                style={[styles.cardWrapper, { transform: [{ translateY: slideAnim }] }]}
                pointerEvents="box-none"
            >
                <View style={styles.glowWrapper}>
                <View style={styles.card}>
                    <BlurView
                        style={StyleSheet.absoluteFillObject}
                        blurType="dark"
                        blurAmount={12}
                        reducedTransparencyFallbackColor="#f4ebeb"
                    />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(10,10,10,0.5)" }]} pointerEvents="none" />

                    {/* Post header */}
                    <View style={styles.postHeader}>
                        {/* Avatar + username */}
                        <View style={styles.userInfo}>
                            {post?.avatar ? (
                                <FastImage source={{ uri: post.avatar }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, { backgroundColor: "#222" }]} />
                            )}
                            <View style={styles.usernameRow}>
                                <Text style={styles.username} numberOfLines={1}>{post?.username ?? ""}</Text>
                                {post?.official && (
                                    <View style={styles.badgeWrapper}>
                                        <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={15} />
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Actions: dots + close */}
                        <View style={styles.headerActions}>
                            <View style={{ position: "relative" }}>
                                <TouchableOpacity
                                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                    onPress={() => setDropdownVisible(prev => !prev)}
                                >
                                    <MaterialCommunityIcons name="dots-vertical" size={22} color="rgba(255,255,255,0.75)" />
                                </TouchableOpacity>

                                {post && (
                                    <DropDown
                                        isVisible={dropdownVisible}
                                        isOwner={currentUserId === post.user_id}
                                        postId={post.post_id}
                                        onClose={() => setDropdownVisible(false)}
                                        onPostDeleted={() => {
                                            setDropdownVisible(false);
                                            onClose();
                                        }}
                                        onPostDeletedFail={() => setDropdownVisible(false)}
                                        onReportResult={() => setDropdownVisible(false)}
                                    />
                                )}
                            </View>

                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                                <View style={styles.closeBtn}>
                                    <X size={15} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <View style={styles.shimmerImage} />
                            <View style={styles.shimmerContent}>
                                <View style={[styles.shimmerLine, { width: "60%" }]} />
                                <View style={[styles.shimmerLine, { width: "90%", marginTop: 8 }]} />
                                <View style={[styles.shimmerLine, { width: "75%", marginTop: 6 }]} />
                            </View>
                        </View>

                    ) : post ? (
                        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                            {/* Image with double tap */}
                            {mediaUrl ? (
                                <Pressable
                                    style={styles.imageWrapper}
                                    onPress={handleDoubleTap}
                                >
                                    <FastImage
                                        source={{ uri: mediaUrl }}
                                        style={styles.image}
                                        resizeMode={FastImage.resizeMode.cover}
                                    />

                                    {/* Big heart overlay on double tap — same as PostList */}
                                    {showHeart && (
                                        <Animated.View
                                            style={[styles.heartOverlay, {
                                                transform: [{ scale: heartOverlayAnim }],
                                                opacity: heartOverlayAnim,
                                            }]}
                                            pointerEvents="none"
                                        >
                                            <MaterialIcons name="favorite" size={90} color="#A855F7" />
                                        </Animated.View>
                                    )}

                                    <View style={styles.imageBadges}>
                                        {post.is_ai_generated && (
                                            <View style={styles.badge}>
                                                <Sparkles size={11} color="#05f0d8" />
                                                <Text style={styles.badgeText}>AI Generated</Text>
                                            </View>
                                        )}
                                        {post.location && (
                                            <View style={styles.badge}>
                                                <MapPin size={11} color="#fff" />
                                                <Text style={styles.badgeText}>{post.location}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
                            ) : (
                                <View style={styles.noMediaContainer}>
                                    <ImageIcon size={44} color="#555" />
                                    <Text style={styles.noMediaText}>No media</Text>
                                </View>
                            )}

                            {/* Content */}
                            <View style={styles.content}>
                                <View style={styles.metaRow}>
                                    <View style={styles.metaChip}>
                                        <Calendar size={12} color="#666" />
                                        <Text style={styles.metaText}>{formatDate(post.create_at)}</Text>
                                    </View>
                                    {post.is_comments_enabled && (
                                        <View style={styles.metaChip}>
                                            <MessageCircle size={12} color="#666" />
                                            <Text style={styles.metaText}>Comments on</Text>
                                        </View>
                                    )}
                                </View>

                                {!!post.about && (
                                    <Text style={styles.aboutText}>{post.about}</Text>
                                )}

                                <View style={styles.divider} />

                                <View style={styles.actionsRow}>
                                    {/* Like */}
                                    <TouchableOpacity style={styles.actionButton} onPress={handleLike} activeOpacity={0.7}>
                                        <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                                            <Heart
                                                size={22}
                                                color={liked ? "#A855F7" : "#999"}
                                                fill={liked ? "#A855F7" : "transparent"}
                                            />
                                        </Animated.View>
                                        <Text style={[styles.actionCount, liked && styles.actionCountActive]}>
                                            {likeCount}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Comments */}
                                    {post.is_comments_enabled && (
                                        <TouchableOpacity style={styles.actionButton} onPress={() => postId !== null && onOpenComments?.(postId)} activeOpacity={0.7}>
                                            <MessageCircle size={22} color="#999" />
                                            <Text style={styles.actionCount}>{post.comments_count ?? 0}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        </ScrollView>
                    ) : null}
                </View>
                </View>
            </Animated.View>

        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    cardWrapper: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
    },
    glowWrapper: {
        width: CARD_WIDTH,
        borderRadius: 24,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 28,
        elevation: 20,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: "transparent",
        borderRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.90,
        overflow: "hidden",
    },
    postHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 10,
        zIndex: 10,
    },
    userInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flex: 1,
    },
    avatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "#1a1a1a",
    },
    usernameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    username: {
        color: "#fff",
        fontSize: 15,
        includeFontPadding: false,
        textAlignVertical: "center",
    },
    badgeWrapper: {
        width: 15,
        height: 15,
        alignItems: "center",
        justifyContent: "center",
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        justifyContent: "center",
        alignItems: "center",
    },
    imageWrapper: {
        width: "100%",
        height: IMAGE_HEIGHT,
        position: "relative",
        backgroundColor: "#111",
        overflow: "hidden",
    },
    image: {
        width: "100%",
        height: "100%",
        backgroundColor: "#111",
    },
    // Big heart overlay — same pattern as PostList
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
    imageBadges: {
        position: "absolute",
        bottom: 12,
        left: 12,
        flexDirection: "row",
        gap: 6,
        flexWrap: "wrap",
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    badgeText: {
        color: "#fff",
        fontSize: 11,
        letterSpacing: 0.3,
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 32,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    metaText: {
        color: "#666",
        fontSize: 12,
    },
    aboutText: {
        color: "#ddd",
        fontSize: 14,
        lineHeight: 21,
        letterSpacing: 0.1,
    },
    divider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.07)",
        marginVertical: 12,
    },
    actionsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    actionButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 6,
        paddingVertical: 4,
        minHeight: 36,
    },
    actionCount: {
        color: "#999",
        fontSize: 14,
    },
    actionCountActive: {
        color: "#A855F7",
    },
    noMediaContainer: {
        width: "100%",
        height: 180,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
    },
    noMediaText: {
        color: "#555",
        fontSize: 13,
    },
    loadingContainer: {
        paddingBottom: 24,
    },
    shimmerImage: {
        width: "100%",
        height: IMAGE_HEIGHT,
        backgroundColor: "#1e1e1e",
    },
    shimmerContent: {
        padding: 16,
        gap: 8,
    },
    shimmerLine: {
        height: 13,
        backgroundColor: "#1e1e1e",
        borderRadius: 6,
    },
});

export default PostPopup;