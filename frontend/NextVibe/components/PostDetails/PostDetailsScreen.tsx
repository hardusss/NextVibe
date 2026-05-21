import React, { useEffect, useState, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    Dimensions,
    useColorScheme,
    Animated,
    Pressable,
    TouchableOpacity,
    Linking,
    ScrollView,
    FlatList,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    LayoutAnimation,
    UIManager,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import getPost from "@/src/api/get.post";
import getComments from "@/src/api/get.comments";
import likePost from "@/src/api/like.post";
import mintNFT from "@/src/api/mint.nft";
import commentLike from "@/src/api/comment.like";
import createComment from "@/src/api/create.comment";
import createCommentReply from "@/src/api/comment.reply";
import getUserDetail from "@/src/api/user.detail";
import { requestToAttend } from "@/src/api/event.requests";
import formatNumber from "@/src/utils/formatNumber";
import timeAgo from "@/src/utils/formatTime";
import { storage } from "@/src/utils/storage";
import useWalletAddress from "@/hooks/useWalletAddress";
import useTransaction from "@/hooks/useTransaction";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";

import Header from "../Wallet/Deposit/Header";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import VerifyBadge from "../VerifyBadge";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import ButtonCollect, { CollectState } from "../NftClaim/ButtonCollect";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";

import { Video, ResizeMode } from "expo-av";
import { ImageZoom } from "@likashefqet/react-native-image-zoom";
import FastImage from "react-native-fast-image";
import Hyperlink from "react-native-hyperlink";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, MaterialIcons, Entypo, AntDesign } from "@expo/vector-icons";
import {
    Heart, MapPin, Volume2, VolumeX,
    Sparkles, Clock, Calendar, Link2,
} from "lucide-react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const REPLIES_BATCH_SIZE = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostMedia {
    id: number;
    media_url: string;
    media_preview?: string | null;
}

interface PostData {
    user_id: number;
    post_id: number;
    username: string;
    avatar: string | null;
    official: boolean;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
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
    is_nft: boolean;
    nft_price: string | null;
    is_owner: boolean;
    already_claimed: boolean;
    sold_out: boolean;
    minted_count: number;
    total_supply: number;
    owner_wallet: string | null;
    is_luma_event?: boolean;
    luma_event_url?: string;
    luma_event_start_time?: string;
    luma_event_end_time?: string;
    event_request_status?: "pending" | "approved" | "rejected" | null;
}

interface User {
    username: string;
    avatar: string;
    official: boolean;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
}
interface Reply {
    reply_id: number;
    user: User;
    user_id: number;
    content: string;
    create_at: string;
    count_likes: number;
}
interface Comment {
    id: number;
    user: User;
    user_id: number;
    content: string;
    create_at: string;
    count_likes: number;
    replies: Reply[];
}
interface UserData {
    username: string;
    avatar: string | null;
    liked_comments: number[];
    liked_comment_replies: number[];
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const darkTheme = {
    background: "#0A0410",
    textPrimary: "#E3E3E3",
    textSecondary: "#888",
    accentColor: "#58a6ff",
    border: "rgba(255,255,255,0.06)",
    inputBg: "rgba(255,255,255,0.05)",
    threadLine: "rgba(255,255,255,0.1)",
};
const lightTheme = {
    background: "#ffffff",
    textPrimary: "#111",
    textSecondary: "#666",
    accentColor: "#0095f6",
    border: "rgba(0,0,0,0.07)",
    inputBg: "rgba(0,0,0,0.04)",
    threadLine: "rgba(0,0,0,0.12)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isVideoUrl = (url: string) => {
    if (url.includes("/video/")) return { storage: "cloudinary", is_video: true };
    const exts = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    if (exts.some((e) => url.toLowerCase().endsWith(e))) return { storage: "r2", is_video: true };
    return false;
};

const getMediaUrls = (item: PostMedia) => {
    const v = isVideoUrl(item.media_url);
    if (!v) return { preview: item.media_url, hd: item.media_url, isVideo: false };
    return { preview: item.media_preview || item.media_url, hd: item.media_url, isVideo: true };
};

const formatEventDate = (iso: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

// ─── Photo Modal ──────────────────────────────────────────────────────────────

const PhotoModal = ({
    visible, images, initialIndex, onClose,
}: {
    visible: boolean;
    images: PostMedia[];
    initialIndex: number;
    onClose: () => void;
}) => {
    const [current, setCurrent] = useState(initialIndex);
    useEffect(() => { if (visible) setCurrent(initialIndex); }, [visible, initialIndex]);

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: "#000" }}>
                <Pressable
                    onPress={onClose}
                    style={{ position: "absolute", top: 52, right: 20, zIndex: 99, padding: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20 }}
                >
                    <AntDesign name="close" size={20} color="#fff" />
                </Pressable>

                {images.length > 1 && (
                    <View style={{ position: "absolute", top: 56, alignSelf: "center", zIndex: 99, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 }}>
                        <Text style={{ color: "#fff", fontSize: 13 }}>{current + 1} / {images.length}</Text>
                    </View>
                )}

                <FlatList
                    data={images}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={initialIndex}
                    getItemLayout={(_, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
                    onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => {
                        const { hd, isVideo } = getMediaUrls(item);
                        if (isVideo) {
                            return (
                                <View style={{ width: screenWidth, height: screenHeight, justifyContent: "center" }}>
                                    <Video source={{ uri: hd }} style={{ width: screenWidth, height: screenWidth }} resizeMode={ResizeMode.CONTAIN} isLooping shouldPlay />
                                </View>
                            );
                        }
                        return (
                            <View style={{ width: screenWidth, height: screenHeight, justifyContent: "center" }}>
                                <ImageZoom uri={item.media_url} minScale={1} maxScale={6} isDoubleTapEnabled style={{ width: screenWidth, height: screenHeight }} resizeMode="contain" />
                            </View>
                        );
                    }}
                />
            </View>
        </Modal>
    );
};

// ─── Media Item ───────────────────────────────────────────────────────────────

const PostMediaItem = ({
    item, isLiked, onLike, onOpenPhoto, styles,
}: {
    item: PostMedia; isLiked: boolean;
    onLike: () => void; onOpenPhoto: () => void;
    styles: ReturnType<typeof getStyles>;
}) => {
    const { hd, isVideo } = getMediaUrls(item);
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const tapCount = useRef(0);
    const tapTimer = useRef<NodeJS.Timeout | null>(null);

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
                if (tapCount.current === 1 && !isVideo) onOpenPhoto();
                tapCount.current = 0;
            }, 250);
        }
    };

    return (
        <Pressable onPress={handlePress} style={styles.mediaContainer}>
            {isVideo ? (
                <>
                    <Video source={{ uri: hd }} style={styles.fullMedia} resizeMode={ResizeMode.COVER} isLooping isMuted={isMuted} shouldPlay />
                    <Pressable onPress={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }} style={styles.muteButton}>
                        {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
                    </Pressable>
                </>
            ) : (
                <FastImage source={{ uri: item.media_url, priority: FastImage.priority.high }} style={styles.fullMedia} resizeMode={FastImage.resizeMode.cover} />
            )}
            {showHeart && (
                <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartAnim }], opacity: heartAnim }]} pointerEvents="none">
                    <Heart size={80} color="#A855F7" fill="#A855F7" />
                </Animated.View>
            )}
        </Pressable>
    );
};

// ─── Comment Thread ───────────────────────────────────────────────────────────

const ReplyItem = ({ item, isLiked, onLike, onReply, theme }: any) => {
    const [expanded, setExpanded] = useState(false);
    const text = item.content;
    const isLong = text.length > 200;

    return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <View style={{ alignItems: "center" }}>
                <AvatarWithFrame avatarUrl={item.user.avatar} size={28} isOg={item.user.is_og} ogEdition={item.user.og_edition} invitedCount={item.user.invited_count} />
            </View>
            <View style={{ flex: 1, paddingBottom: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
                    <Text style={{ color: theme.textPrimary, fontFamily: "Dank Mono Bold", fontSize: 13 }}>{item.user.username}</Text>
                    {item.user.official && <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={13} />}
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>· {timeAgo(item.create_at)}</Text>
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {isLong && !expanded ? `${text.slice(0, 200)}…` : text}
                </Text>
                {isLong && (
                    <TouchableOpacity onPress={() => setExpanded(!expanded)}>
                        <Text style={{ color: "#A855F7", fontSize: 13, marginTop: 3 }}>{expanded ? "Show less" : "Show more"}</Text>
                    </TouchableOpacity>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 }}>
                    <TouchableOpacity onPress={onReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, fontFamily: "Dank Mono Bold" }}>Reply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {item.count_likes > 0 && <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{item.count_likes}</Text>}
                        <MaterialIcons name={isLiked ? "favorite" : "favorite-border"} size={14} color={isLiked ? "#A855F7" : theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const CommentItem = ({ item, likedComments, onLike, onReply, theme, isLast }: any) => {
    const [textExpanded, setTextExpanded] = useState(false);
    const [visibleReplies, setVisibleReplies] = useState(0);
    const text = item.content;
    const isLong = text.length > 200;
    const totalReplies = item.replies?.length || 0;
    const allShown = visibleReplies >= totalReplies;
    const hasReplies = totalReplies > 0;

    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: isLast ? 14 : 0 }}>
            <View style={{ flexDirection: "row", gap: 11 }}>

                {/* Left column: avatar + thread line */}
                <View style={{ alignItems: "center", width: 36 }}>
                    <AvatarWithFrame avatarUrl={item.user.avatar} size={36} isOg={item.user.is_og} ogEdition={item.user.og_edition} invitedCount={item.user.invited_count} />
                    {/* Thread line shown only when there are visible replies */}
                    {visibleReplies > 0 && (
                        <View style={{ flex: 1, width: 2, backgroundColor: theme.threadLine, borderRadius: 1, marginTop: 6 }} />
                    )}
                </View>

                {/* Right column: content */}
                <View style={{ flex: 1 }}>
                    {/* Header */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3, flexWrap: "wrap" }}>
                        <Text style={{ color: theme.textPrimary, fontFamily: "Dank Mono Bold", fontSize: 14 }}>{item.user.username}</Text>
                        {item.user.official && <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={14} />}
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>· {timeAgo(item.create_at)}</Text>
                    </View>

                    {/* Text */}
                    <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                        {isLong && !textExpanded ? `${text.slice(0, 200)}…` : text}
                    </Text>
                    {isLong && (
                        <TouchableOpacity onPress={() => setTextExpanded(!textExpanded)}>
                            <Text style={{ color: "#A855F7", fontSize: 13, marginTop: 3 }}>{textExpanded ? "Show less" : "Show more"}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Actions */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 10 }}>
                        <TouchableOpacity onPress={() => onReply(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color: theme.textSecondary, fontSize: 13, fontFamily: "Dank Mono Bold" }}>Reply</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onLike(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            {item.count_likes > 0 && <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{item.count_likes}</Text>}
                            <MaterialIcons name={likedComments.comments[item.id] ? "favorite" : "favorite-border"} size={16} color={likedComments.comments[item.id] ? "#A855F7" : theme.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Replies */}
                    {visibleReplies > 0 && item.replies && (
                        <View>
                            {item.replies.slice(0, visibleReplies).map((r: Reply) => (
                                <ReplyItem
                                    key={r.reply_id}
                                    item={r}
                                    isLiked={!!likedComments.replies[r.reply_id]}
                                    onLike={() => onLike(r)}
                                    onReply={() => onReply(r)}
                                    theme={theme}
                                />
                            ))}
                        </View>
                    )}

                    {/* View / hide replies */}
                    {hasReplies && (
                        <View style={{ flexDirection: "row", gap: 16, marginTop: 10, marginBottom: 4 }}>
                            {!allShown && (
                                <TouchableOpacity
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setVisibleReplies((v) => Math.min(totalReplies, v + REPLIES_BATCH_SIZE));
                                    }}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                                >
                                    <Text style={{ color: "#A855F7", fontSize: 13, fontFamily: "Dank Mono Bold" }}>
                                        {visibleReplies === 0 ? `${totalReplies} ${totalReplies === 1 ? "reply" : "replies"}` : `${totalReplies - visibleReplies} more`}
                                    </Text>
                                    <Entypo name="chevron-down" size={13} color="#A855F7" />
                                </TouchableOpacity>
                            )}
                            {visibleReplies > 0 && (
                                <TouchableOpacity
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setVisibleReplies(0);
                                    }}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                                >
                                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Hide</Text>
                                    <Entypo name="chevron-up" size={13} color={theme.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </View>

            {/* Separator — thin line between comments, not after last */}
            {!isLast && (
                <View style={{ height: 1, backgroundColor: theme.border, marginTop: 14, marginLeft: 47 }} />
            )}
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: typeof darkTheme) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        scrollContent: { paddingBottom: 120 },
        postContainer: { paddingHorizontal: 16, paddingTop: 14 },
        postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
        userInfo: { flex: 1, marginLeft: 12 },
        usernameRow: { flexDirection: "row", alignItems: "center" },
        badgeWrapper: { marginLeft: 2 },
        username: { fontSize: 16, fontFamily: "Dank Mono Bold", color: theme.textPrimary, includeFontPadding: false },
        mediaWrapper: { borderRadius: 14, overflow: "hidden", marginBottom: 12 },
        mediaContainer: { width: screenWidth - 32, aspectRatio: 1, backgroundColor: "#111", overflow: "hidden" },
        fullMedia: { width: "100%", height: "100%" },
        heartOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 15 },
        muteButton: { position: "absolute", bottom: 14, right: 14, backgroundColor: "rgba(0,0,0,0.55)", padding: 7, borderRadius: 18, zIndex: 20 },
        pageIndicator: { position: "absolute", right: 12, top: 10, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
        pageIndicatorText: { color: "#fff", fontSize: 12 },
        imageBadges: { position: "absolute", bottom: 12, left: 12, flexDirection: "row", gap: 6, flexWrap: "wrap" },
        imageBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.8)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
        imageBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Dank Mono", includeFontPadding: false },
        nftBadge: { borderColor: "rgba(168,85,247,0.5)", backgroundColor: "rgba(30,0,50,0.85)" },
        nftBadgeText: { color: "#d8b4fe", fontSize: 11, fontFamily: "Dank Mono", includeFontPadding: false },
        metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
        metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
        metaText: { color: theme.textSecondary, fontSize: 12, fontFamily: "Dank Mono", includeFontPadding: false },
        postContent: { marginBottom: 12 },
        postText: { fontSize: 15, color: theme.textPrimary, lineHeight: 22 },
        // Stats
        statsRow: { flexDirection: "row", gap: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.border },
        statItem: { flexDirection: "row", alignItems: "baseline", gap: 4 },
        statCount: { fontSize: 16, fontFamily: "Dank Mono Bold", color: theme.textPrimary },
        statLabel: { fontSize: 14, color: theme.textSecondary },
        // Action row
        actionsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
        // Comments heading
        commentsHeading: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
        commentsHeadingText: { fontSize: 17, fontFamily: "Dank Mono Bold", color: theme.textPrimary },
        commentsTopBorder: { height: 1, backgroundColor: theme.border },
        emptyComments: { paddingVertical: 40, alignItems: "center", gap: 10 },
        emptyText: { color: theme.textSecondary, fontSize: 14 },
        // Input bar
        inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border },
        inputAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1a1a1a" },
        inputWrap: { flex: 1, backgroundColor: theme.inputBg, borderRadius: 22, borderWidth: 1, borderColor: "rgba(168,85,247,0.25)", paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
        input: { color: theme.textPrimary, fontSize: 14, maxHeight: 90 },
        sendBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden" },
        sendBtnGradient: { flex: 1, justifyContent: "center", alignItems: "center" },
        replyingToBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "rgba(168,85,247,0.06)", borderTopWidth: 1, borderTopColor: "rgba(168,85,247,0.12)" },
        replyingToText: { color: theme.textSecondary, fontSize: 13 },
        loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    });

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PostDetailsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const isDark = useColorScheme() === "dark";
    const theme = isDark ? darkTheme : lightTheme;
    const styles = getStyles(theme);

    const [post, setPost] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [userID, setUserID] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    // ── FIX: dropdown tracks by boolean, not post id comparison ──
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [toastConfig, setToastConfig] = useState({ visible: false, message: "", isSuccess: true });

    const [photoModalVisible, setPhotoModalVisible] = useState(false);
    const [photoModalIndex, setPhotoModalIndex] = useState(0);

    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [likedComments, setLikedComments] = useState<{ comments: Record<number, boolean>; replies: Record<number, boolean> }>({ comments: {}, replies: {} });
    const [replyingTo, setReplyingTo] = useState<Comment | Reply | null>(null);
    const [commentText, setCommentText] = useState("");
    const [owner, setOwner] = useState<string | null>(null);

    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const { address } = useWalletAddress();
    const { sendInstructions } = useTransaction();

    useEffect(() => {
        const init = async () => {
            const storedId = await storage.getItem("id");
            setUserID(storedId ? +storedId : 0);
            fetchPost();
            fetchComments();
            fetchUser();
        };
        if (id) init();
    }, [id]);

    const fetchPost = async () => {
        setLoading(true);
        try {
            const res = await getPost(Number(id));
            if (res?.data) {
                setPost(res.data);
                setIsLiked(res.data.liked_posts?.includes(res.data.post_id) ?? false);
                setLikeCount(res.data.count_likes);
            }
        } finally { setLoading(false); }
    };

    const fetchComments = async () => {
        setCommentsLoading(true);
        try {
            const data = await getComments(Number(id));
            if (data && Array.isArray(data.comments)) {
                setOwner(data.author ?? null);
                setComments(data.comments);
            }
        } finally { setCommentsLoading(false); }
    };

    const fetchUser = async () => {
        const u = await getUserDetail();
        setUserData(u);
        setLikedComments({
            comments: u.liked_comments.reduce((a: any, id: number) => ({ ...a, [id]: true }), {}),
            replies: u.liked_comment_replies.reduce((a: any, id: number) => ({ ...a, [id]: true }), {}),
        });
    };

    const toggleLike = useCallback(() => {
        if (!post) return;
        likePost(post.post_id);
        setIsLiked((p) => !p);
        setLikeCount((p) => (isLiked ? p - 1 : p + 1));
    }, [isLiked, post]);

    const toggleCommentLike = useCallback(async (item: Comment | Reply) => {
        const isReply = "reply_id" in item;
        await commentLike(isReply ? item.reply_id : item.id, isReply);
        const wasLiked = isReply ? likedComments.replies[item.reply_id] : likedComments.comments[item.id];
        setLikedComments((prev) => {
            if (isReply) return { ...prev, replies: { ...prev.replies, [item.reply_id]: !prev.replies[item.reply_id] } };
            return { ...prev, comments: { ...prev.comments, [item.id]: !prev.comments[item.id] } };
        });
        setComments((prev) =>
            prev.map((c) => {
                if (isReply) {
                    if (c.replies.some((r) => r.reply_id === (item as Reply).reply_id))
                        return { ...c, replies: c.replies.map((r) => r.reply_id === (item as Reply).reply_id ? { ...r, count_likes: r.count_likes + (wasLiked ? -1 : 1) } : r) };
                } else if (c.id === (item as Comment).id) {
                    return { ...c, count_likes: c.count_likes + (wasLiked ? -1 : 1) };
                }
                return c;
            })
        );
    }, [likedComments]);

    const findParentComment = (replyId: number) =>
        comments.find((c) => c.replies.some((r) => r.reply_id === replyId)) || null;

    const handleSendComment = async () => {
        if (!commentText.trim() || !post?.is_comments_enabled) return;
        if (replyingTo === null) {
            const res = await createComment(commentText, post.post_id);
            setComments((p) => [res, ...p]);
        } else {
            const commentId = "id" in replyingTo ? replyingTo.id : (findParentComment(replyingTo.reply_id)?.id || replyingTo.reply_id);
            const res = await createCommentReply(commentText, commentId);
            if (res) {
                setComments((p) => p.map((c) => c.id === commentId ? { ...c, replies: [...c.replies, res] } : c));
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            setReplyingTo(null);
        }
        setCommentText("");
    };

    const handleRequestToAttend = async () => {
        if (!post) return;
        try {
            await requestToAttend(post.post_id);
            setToastConfig({ visible: true, message: "Request to attend sent!", isSuccess: true });
            setPost((p) => p ? { ...p, event_request_status: "pending" } : null);
        } catch (e: any) {
            setToastConfig({ visible: true, message: e.response?.data?.error || "Failed", isSuccess: false });
        }
    };

    const handleMint = async (postId: number, price: number) => {
        if (!address || !post) throw new Error("Wallet not connected");
        if (post.is_owner) {
            await mintNFT(address, postId, price);
        } else {
            if (!post.owner_wallet) throw new Error("Owner wallet not found");
            const ixs = buildMintPaymentInstructions(address, post.owner_wallet, price);
            const sig = await sendInstructions(ixs, "post_detail");
            if (!sig) throw new Error("Payment not confirmed");
            await mintNFT(address, postId, price, sig);
        }
        setPost((p) => p ? { ...p, already_claimed: true, minted_count: (p.minted_count ?? 0) + 1 } : null);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Header title="Post" isDark={isDark} insets={insets} onBack={() => router.back()} />
                <View style={styles.loadingContainer}>
                    <CustomActivityIndicator size="large" color={theme.accentColor} />
                </View>
            </View>
        );
    }

    if (!post) return null;

    const mediaItems = post.media || [];
    const hasMedia = mediaItems.length > 0;
    const isLumaEvent = post.is_luma_event;
    const totalComments = comments.reduce((t, c) => t + 1 + (c.replies?.length || 0), 0);

    let collectState: CollectState | null = null;
    if (post.is_nft || post.is_owner) {
        if (post.already_claimed) collectState = "claimed";
        else if (post.sold_out) collectState = "soldout";
        else collectState = "collect";
    }

    return (
        <View style={styles.container}>
            <StatusBar backgroundColor={theme.background} barStyle={isDark ? "light-content" : "dark-content"} />
            <Header title="Post" isDark={isDark} insets={insets} onBack={() => router.back()} />

            <Web3Toast message={toastConfig.message} visible={toastConfig.visible} onHide={() => setToastConfig((p) => ({ ...p, visible: false }))} isSuccess={toastConfig.isSuccess} />

            <MintBottomSheet
                ref={mintSheetRef}
                postId={post.post_id}
                imageUrl={mediaItems[0]?.media_url ?? null}
                creatorUsername={post.username}
                walletConnected={!!address}
                onMint={handleMint}
                isOwner={post.is_owner}
                defaultPrice={post.nft_price}
                page="post_detail"
            />

            <PhotoModal visible={photoModalVisible} images={mediaItems} initialIndex={photoModalIndex} onClose={() => setPhotoModalVisible(false)} />

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.bottom}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* ── Post block ── */}
                    <View style={styles.postContainer}>

                        {/* Header */}
                        <View style={styles.postHeader}>
                            <TouchableOpacity onPress={() => router.push({ pathname: "/user-profile", params: { id: post.user_id } })}>
                                <AvatarWithFrame avatarUrl={post.avatar} size={42} isOg={post.is_og} ogEdition={post.og_edition} invitedCount={post.invited_count} />
                            </TouchableOpacity>
                            <View style={styles.userInfo}>
                                <View style={styles.usernameRow}>
                                    <Text style={styles.username}>{post.username}</Text>
                                    {post.official && (
                                        <View style={styles.badgeWrapper}>
                                            <VerifyBadge isLooped={true} isVisible={true} haveModal={false} isStatic={false} size={16} />
                                        </View>
                                    )}
                                </View>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                {collectState !== null && !isLumaEvent && (
                                    <ButtonCollect onPress={() => mintSheetRef.current?.present()} state={collectState} supplyLabel={`${post.minted_count ?? 0}/${post.total_supply ?? 50}`} />
                                )}
                                <Pressable
                                    style={{ padding: 6 }}
                                    onPress={() => setDropdownOpen(true)}
                                >
                                    <MaterialCommunityIcons name="dots-vertical" color={theme.textPrimary} size={24} />
                                </Pressable>
                                {/* ── FIX: DropDown використовує dropdownOpen, onClose скидає в false ── */}
                                <DropDown
                                    isVisible={dropdownOpen}
                                    isOwner={userID === post.user_id}
                                    postId={post.post_id}
                                    onClose={() => setDropdownOpen(false)}
                                    onPostDeleted={() => router.back()}
                                    onReportResult={(reported?: boolean, msg?: string) => {
                                        setDropdownOpen(false);
                                        if (msg) setToastConfig({ visible: true, message: msg, isSuccess: false });
                                        else if (reported) setToastConfig({ visible: true, message: "Report submitted", isSuccess: true });
                                    }}
                                />
                            </View>
                        </View>

                        {/* Media */}
                        {hasMedia && (
                            <View style={[styles.mediaWrapper, { marginBottom: 12 }]}>
                                {mediaItems.length > 1 ? (
                                    <View style={{ position: "relative" }}>
                                        <FlatList
                                            data={mediaItems}
                                            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                                            keyExtractor={(item) => item.id.toString()}
                                            onMomentumScrollEnd={(e) => setCurrentMediaIndex(Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 32)))}
                                            renderItem={({ item, index }) => (
                                                <PostMediaItem item={item} isLiked={isLiked} onLike={toggleLike} onOpenPhoto={() => { setPhotoModalIndex(index); setPhotoModalVisible(true); }} styles={styles} />
                                            )}
                                        />
                                        <View style={styles.pageIndicator}>
                                            <Text style={styles.pageIndicatorText}>{currentMediaIndex + 1}/{mediaItems.length}</Text>
                                        </View>
                                    </View>
                                ) : (
                                    <PostMediaItem item={mediaItems[0]} isLiked={isLiked} onLike={toggleLike} onOpenPhoto={() => { setPhotoModalIndex(0); setPhotoModalVisible(true); }} styles={styles} />
                                )}
                                <View style={styles.imageBadges} pointerEvents="none">
                                    {post.is_ai_generated && (
                                        <View style={styles.imageBadge}>
                                            <Sparkles size={11} color="#05f0d8" />
                                            <Text style={styles.imageBadgeText}>AI</Text>
                                        </View>
                                    )}
                                    {post.is_nft && (
                                        <View style={[styles.imageBadge, styles.nftBadge]}>
                                            <Text style={styles.nftBadgeText}>{post.minted_count}/{post.total_supply} minted</Text>
                                        </View>
                                    )}
                                    {post.location && (
                                        <View style={styles.imageBadge}>
                                            <MapPin size={11} color="#fff" />
                                            <Text style={styles.imageBadgeText}>{post.location}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                        {/* Full text (no truncation on detail screen) */}
                        {!!post.about && (
                            <View style={styles.postContent}>
                                <Hyperlink linkStyle={{ color: "#A78BFA" }} onPress={(url: string) => Linking.openURL(url)}>
                                    <Text style={styles.postText}>{post.about}</Text>
                                </Hyperlink>
                            </View>
                        )}
                        {/* Meta chips */}
                        <View style={styles.metaRow}>
                            <View style={styles.metaChip}>
                                <Clock size={12} color={theme.textSecondary} />
                                <Text style={styles.metaText}>{timeAgo(post.create_at)}</Text>
                            </View>
                            {post.location && !hasMedia && (
                                <View style={styles.metaChip}>
                                    <MapPin size={12} color={theme.textSecondary} />
                                    <Text style={styles.metaText}>{post.location}</Text>
                                </View>
                            )}
                        </View>

                        {/* Luma event */}
                        {isLumaEvent && post.luma_event_url && (
                            <View style={{ marginBottom: 14, padding: 14, backgroundColor: "rgba(168,85,247,0.08)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(168,85,247,0.18)" }}>
                                {post.luma_event_start_time && (
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                        <Calendar size={15} color="#d8b4fe" />
                                        <Text style={{ color: "#d8b4fe", fontSize: 13, fontFamily: "Dank Mono Bold" }}>{formatEventDate(post.luma_event_start_time)}</Text>
                                    </View>
                                )}
                                {(() => {
                                    const isPending = post.event_request_status === "pending";
                                    const isApproved = post.event_request_status === "approved";
                                    const isOwner = post.user_id === userID;
                                    if (isApproved || isOwner) return (
                                        <Pressable onPress={() => Linking.openURL(post.luma_event_url!)} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(168,85,247,0.2)", padding: 10, borderRadius: 10, justifyContent: "center" }}>
                                            <Link2 size={16} color="#d8b4fe" />
                                            <Text style={{ color: "#d8b4fe", fontFamily: "Dank Mono Bold" }}>View Event on Luma</Text>
                                        </Pressable>
                                    );
                                    return (
                                        <Pressable disabled={isPending} onPress={handleRequestToAttend} style={{ padding: 10, borderRadius: 10, backgroundColor: "rgba(168,85,247,0.2)", justifyContent: "center", alignItems: "center", opacity: isPending ? 0.7 : 1 }}>
                                            <Text style={{ color: "#d8b4fe", fontFamily: "Dank Mono Bold" }}>{isPending ? "Requested" : "Request to Attend"}</Text>
                                        </Pressable>
                                    );
                                })()}
                            </View>
                        )}

                        {/* Stats row */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statCount}>{formatNumber(likeCount)}</Text>
                                <Text style={styles.statLabel}>Likes</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statCount}>{formatNumber(totalComments)}</Text>
                                <Text style={styles.statLabel}>Comments</Text>
                            </View>
                            {post.is_nft && (
                                <View style={styles.statItem}>
                                    <Text style={[styles.statCount, { color: "#d8b4fe" }]}>{post.minted_count}</Text>
                                    <Text style={styles.statLabel}>Minted</Text>
                                </View>
                            )}
                        </View>

                        {/* Action row — only like button (comments inline) */}
                        <View style={styles.actionsRow}>
                            <Pressable onPress={toggleLike} style={{ padding: 4 }}>
                                <Heart size={26} color={isLiked ? "#A855F7" : theme.textPrimary} fill={isLiked ? "#A855F7" : "transparent"} />
                            </Pressable>
                        </View>
                    </View>

                    {/* ── Comments ── */}
                    <View style={styles.commentsHeading}>
                        <Text style={styles.commentsHeadingText}>
                            {post.is_comments_enabled
                                ? totalComments > 0 ? `Comments · ${totalComments}` : "Comments"
                                : "Comments disabled"}
                        </Text>
                    </View>
                    <View style={styles.commentsTopBorder} />

                    {commentsLoading ? (
                        <View style={{ paddingVertical: 36, alignItems: "center" }}>
                            <CustomActivityIndicator size="large" color="#A855F7" />
                        </View>
                    ) : !post.is_comments_enabled ? (
                        <View style={styles.emptyComments}>
                            <MaterialIcons name="comments-disabled" size={34} color="#333" />
                            <Text style={styles.emptyText}>Comments are disabled</Text>
                        </View>
                    ) : comments.length === 0 ? (
                        <View style={styles.emptyComments}>
                            <MaterialIcons name="chat-bubble-outline" size={34} color="#333" />
                            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
                        </View>
                    ) : (
                        comments.map((comment, idx) => (
                            <CommentItem
                                key={comment.id}
                                item={comment}
                                likedComments={likedComments}
                                onLike={toggleCommentLike}
                                onReply={(item: Comment | Reply) => setReplyingTo(item)}
                                theme={theme}
                                isLast={idx === comments.length - 1}
                            />
                        ))
                    )}
                </ScrollView>

                {/* ── Fixed input ── */}
                <View>
                    {replyingTo && (
                        <View style={styles.replyingToBar}>
                            <Text style={styles.replyingToText}>
                                Replying to <Text style={{ color: "#A855F7" }}>{replyingTo.user.username}</Text>
                            </Text>
                            <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <AntDesign name="close" size={14} color="#888" />
                            </TouchableOpacity>
                        </View>
                    )}
                    {post.is_comments_enabled && (
                        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                            <FastImage source={{ uri: userData?.avatar ?? undefined }} style={styles.inputAvatar} />
                            <View style={styles.inputWrap}>
                                <TextInput
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    placeholder={`Reply to ${owner ?? "post"}…`}
                                    placeholderTextColor="#555"
                                    style={styles.input}
                                    returnKeyType="send"
                                    onSubmitEditing={handleSendComment}
                                    multiline
                                    maxLength={500}
                                />
                            </View>
                            <TouchableOpacity onPress={handleSendComment} disabled={!commentText.trim()} style={[styles.sendBtn, !commentText.trim() && { opacity: 0.35 }]}>
                                <LinearGradient colors={commentText.trim() ? ["#A855F7", "#7C3AED"] : ["#1a1a1a", "#1a1a1a"]} style={styles.sendBtnGradient}>
                                    <MaterialIcons name="arrow-upward" size={18} color={commentText.trim() ? "#fff" : "#444"} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}