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
    Linking,
    ScrollView,
    FlatList
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import getPost from "@/src/api/get.post";
import likePost from "@/src/api/like.post";
import mintNFT from "@/src/api/mint.nft";
import { requestToAttend } from "@/src/api/event.requests";
import formatNumber from "@/src/utils/formatNumber";
import timeAgo from "@/src/utils/formatTime";
import { storage } from '@/src/utils/storage';
import useWalletAddress from "@/hooks/useWalletAddress";
import useTransaction from "@/hooks/useTransaction";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";

import Header from "../Wallet/Deposit/Header";
import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import PopupModal from "../Comments/CommentPopup";
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import VerifyBadge from "../VerifyBadge";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import ButtonCollect, { CollectState } from "../NftClaim/ButtonCollect";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";

import { Video, ResizeMode } from 'expo-av';
import { ImageZoom } from '@likashefqet/react-native-image-zoom';
import Hyperlink from "react-native-hyperlink";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
    Heart, MessageCircle, MapPin, Volume2, VolumeX,
    Sparkles, Clock, Calendar, Link2
} from "lucide-react-native";

/**
 * Screen dimensions used for responsive media sizing.
 */
const { width: screenWidth } = Dimensions.get("window");

/**
 * Represents a single media item attached to a post.
 */
interface PostMedia {
    id: number;
    media_url: string;
    media_preview?: string | null;
}

/**
 * Represents the structured data of a Post fetched via the `getPost` API.
 */
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
    luma_event_verified?: boolean;
    luma_event_start_time?: string;
    luma_event_end_time?: string;
    event_request_status?: "pending" | "approved" | "rejected" | null;
}

const darkTheme = {
    background: "#0A0410",
    cardBackground: "#0A0410",
    textPrimary: "#E3E3E3",
    textSecondary: "#aaa",
    accentColor: "#58a6ff",
};

const lightTheme = {
    background: "white",
    cardBackground: "rgba(255, 255, 255, 1)",
    textPrimary: "#333",
    textSecondary: "#666",
    accentColor: "#0095f6",
};

const getStyles = (theme: typeof darkTheme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: 50 },
    postContainer: { padding: 14, position: "relative" },
    postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    userInfo: { flex: 1, marginLeft: 12 },
    usernameRow: { flexDirection: "row", alignItems: "center" },
    badgeWrapper: { marginLeft: 1, justifyContent: 'center', alignItems: 'center' },
    username: { fontSize: 16, fontFamily: "Dank Mono Bold", includeFontPadding: false, color: theme.textPrimary },
    mediaPlaceholder: { width: "100%", backgroundColor: '#1a1a1a', borderRadius: 8, marginBottom: 12, overflow: "hidden" },
    mediaContainer: { width: screenWidth - 28, height: screenWidth - 28, backgroundColor: '#1a1a1a', overflow: "hidden" },
    fullMedia: { width: "100%", height: "100%" },
    postContent: { marginBottom: 12 },
    postText: { fontSize: 15, color: theme.textPrimary, lineHeight: 20 },
    postFooter: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "center" },
    likesContainer: { flexDirection: "row", alignItems: "center" },
    likesCount: { marginLeft: 6, color: theme.textPrimary, fontSize: 14 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, marginBottom: 10 },
    metaChip: { flexDirection: "row", alignItems: "center", gap: 5 },
    metaText: { color: "#666", fontSize: 12, fontFamily: "Dank Mono", includeFontPadding: false },
    muteButton: { position: "absolute", bottom: 20, right: 20, backgroundColor: "rgba(0, 0, 0, 0.6)", padding: 8, borderRadius: 20, zIndex: 20 },
    pageIndicator: { position: "absolute", right: 20, top: 10, backgroundColor: "rgba(0, 0, 0, 0.6)", padding: 5, borderRadius: 10 },
    pageIndicatorText: { color: "white", fontSize: 12 },
    heartOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', zIndex: 15, pointerEvents: 'none' },
    imageBadges: { position: "absolute", bottom: 12, left: 12, flexDirection: "row", gap: 6, flexWrap: "wrap", pointerEvents: "none" },
    imageBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
    imageBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Dank Mono", includeFontPadding: false },
    nftBadge: { borderColor: "rgba(168,85,247,0.6)", backgroundColor: "rgba(30, 0, 50, 0.85)" },
    nftBadgeText: { color: "#d8b4fe", fontSize: 11, fontFamily: "Dank Mono", includeFontPadding: false },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

/**
 * Checks if a given media URL is a video.
 * @param {string} url - The URL of the media.
 * @returns {object | boolean} An object containing storage type and video flag, or false.
 */
const isVideo = (url: string) => {
    if (url.includes("/video/")) return { storage: "cloudinary", is_video: true };
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    if (videoExtensions.some(ext => url.toLowerCase().endsWith(ext))) return { storage: "r2", is_video: true };
    return false;
};

/**
 * Extracts preview and high-definition URLs for a media item.
 * @param {PostMedia} mediaItem - The media item to process.
 * @returns {object} Object containing preview URL, hd URL, and a boolean indicating if it's a video.
 */
const getVideoUrls = (mediaItem: PostMedia) => {
    const videoCheck = isVideo(mediaItem.media_url);
    if (!videoCheck) return { preview: mediaItem.media_url, hd: mediaItem.media_url, isVideo: false };
    return { preview: mediaItem.media_preview || mediaItem.media_url, hd: mediaItem.media_url, isVideo: true };
};

/**
 * Formats an ISO date string into a highly readable event format.
 * @param {string} isoString - The ISO date string.
 * @returns {string} Formatted date string (e.g., "Oct 24, 05:30 PM").
 */
const formatEventDate = (isoString: string): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/**
 * Component responsible for rendering individual media items (Images or Videos) within a post.
 * Includes double-tap to like functionality and pinch-to-zoom for images.
 */
const DetailMediaItem = ({ item, postId, onLike, isLiked, dynamicHeight, styles }: any) => {
    const { hd, isVideo: isVideoMedia } = getVideoUrls(item);
    const [isMuted, setIsMuted] = useState(true);
    const [showHeart, setShowHeart] = useState(false);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const videoRef = useRef<Video>(null);
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

    const handleDoublePress = () => {
        tapCount.current += 1;
        if (tapTimer.current) clearTimeout(tapTimer.current);
        if (tapCount.current === 2) {
            animateHeart();
            if (!isLiked) onLike(postId);
            tapCount.current = 0;
        } else {
            tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 300);
        }
    };

    return (
        <Pressable onPress={handleDoublePress} style={[styles.mediaContainer, dynamicHeight ? { height: dynamicHeight } : {}]}>
            {isVideoMedia ? (
                <>
                    <Video
                        ref={videoRef}
                        style={[styles.fullMedia, dynamicHeight ? { height: dynamicHeight } : {}]}
                        source={{ uri: hd }}
                        resizeMode={ResizeMode.COVER}
                        isLooping
                        isMuted={isMuted}
                        shouldPlay={true}
                    />
                    <Pressable onPress={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} style={styles.muteButton}>
                        {isMuted ? <VolumeX size={20} color="white" /> : <Volume2 size={20} color="white" />}
                    </Pressable>
                </>
            ) : (
                <ImageZoom
                    uri={item.media_url}
                    minScale={1}
                    maxScale={5}
                    isDoubleTapEnabled={true}
                    onDoubleTap={handleDoublePress}
                    style={[styles.fullMedia, dynamicHeight ? { height: dynamicHeight } : {}]}
                    resizeMode="contain"
                />
            )}
            
            {showHeart && (
                <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartAnim }], opacity: heartAnim }]}>
                    <Heart size={80} color="#A855F7" fill="#A855F7" />
                </Animated.View>
            )}
        </Pressable>
    );
};

/**
 * Main screen component for displaying a detailed view of a specific post.
 * Handles fetching the post by ID, likes, minting NFTs, and Luma event interactions.
 */
export default function PostDetailsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id } = useLocalSearchParams();
    
    const isDarkMode = useColorScheme() === 'dark';
    const theme = isDarkMode ? darkTheme : lightTheme;
    const styles = getStyles(theme);

    const [post, setPost] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [userID, setUserID] = useState<number>(0);
    const [isLiked, setIsLiked] = useState<boolean>(false);
    const [likeCount, setLikeCount] = useState<number>(0);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [eventImageHeight, setEventImageHeight] = useState<number | null>(null);
    
    const [dropdownVisible, setDropdownVisible] = useState<number | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [toastConfig, setToastConfig] = useState({ visible: false, message: "", isSuccess: true });

    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const { address } = useWalletAddress();
    const { sendInstructions } = useTransaction();

    useEffect(() => {
        const init = async () => {
            const storedId = await storage.getItem("id");
            setUserID(storedId ? +storedId : 0);
            fetchPostDetails();
        };
        if (id) init();
    }, [id]);

    /**
     * Fetches the specific post's data using the provided ID.
     */
    const fetchPostDetails = async () => {
        setLoading(true);
        try {
            const response = await getPost(Number(id));
            if (response?.data) {
                setPost(response.data);
                setIsLiked(response.data.liked_posts?.includes(response.data.post_id) ?? false);
                setLikeCount(response.data.count_likes);
            }
        } catch (error) {
            console.error("Error fetching post details:", error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Toggles the like status of the current post.
     */
    const toggleLike = useCallback(() => {
        if (!post) return;
        likePost(post.post_id);
        setIsLiked((prev) => !prev);
        setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    }, [isLiked, post]);

    /**
     * Dispatches a request to attend a Luma event associated with the post.
     */
    const handleRequestToAttend = async () => {
        if (!post) return;
        try {
            await requestToAttend(post.post_id);
            setToastConfig({ visible: true, message: "Your request to attend has been sent!", isSuccess: true });
            setPost((prev) => prev ? { ...prev, event_request_status: "pending" } : null);
        } catch (e: any) {
            setToastConfig({ visible: true, message: e.response?.data?.error || "Failed to send request", isSuccess: false });
        }
    };

    /**
     * Handles the NFT minting process.
     * @param {number} postId - The ID of the post being minted.
     * @param {number} price - The price of the NFT.
     */
    const handleMint = async (postId: number, price: number) => {
        if (!address || !post) throw new Error("Wallet not connected");
        
        if (post.is_owner) {
            await mintNFT(address, postId, price);
        } else {
            if (!post.owner_wallet) throw new Error("Owner wallet not found");
            const ixs = buildMintPaymentInstructions(address, post.owner_wallet, price);
            const paymentSignature = await sendInstructions(ixs, "post_detail");
            if (!paymentSignature) throw new Error("Payment was not confirmed");
            await mintNFT(address, postId, price, paymentSignature);
        }
        
        setPost((prev) => prev ? { ...prev, already_claimed: true, minted_count: (prev.minted_count ?? 0) + 1 } : null);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Header title="Post" isDark={isDarkMode} insets={insets} onBack={() => router.back()} />
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

    let collectState: CollectState | null = null;
    if (post.is_nft || post.is_owner) {
        if (post.already_claimed) collectState = "claimed";
        else if (post.sold_out) collectState = "soldout";
        else collectState = "collect";
    }

    return (
        <View style={styles.container}>
            <StatusBar backgroundColor={theme.background} barStyle={isDarkMode ? "light-content" : "dark-content"} />
            <Header title="Post" isDark={isDarkMode} insets={insets} onBack={() => router.back()} />

            <Web3Toast 
                message={toastConfig.message} 
                visible={toastConfig.visible} 
                onHide={() => setToastConfig(prev => ({ ...prev, visible: false }))} 
                isSuccess={toastConfig.isSuccess} 
            />
            
            {showPopup && (
                <PopupModal 
                    post_id={post.post_id} 
                    onClose={() => setShowPopup(false)} 
                    isCommentsEnabled={post.is_comments_enabled} 
                />
            )}

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

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.postContainer}>
                    
                    <View style={styles.postHeader}>
                        <AvatarWithFrame 
                            avatarUrl={post.avatar} 
                            size={40} 
                            isOg={post.is_og} 
                            ogEdition={post.og_edition} 
                            invitedCount={post.invited_count} 
                        />
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

                        <View style={{ flexDirection: "row" }}>
                            {collectState !== null && !isLumaEvent && (
                                <ButtonCollect 
                                    onPress={() => mintSheetRef.current?.present()} 
                                    state={collectState} 
                                    supplyLabel={`${post.minted_count ?? 0}/${post.total_supply ?? 50}`} 
                                />
                            )}
                            <Pressable style={{ padding: 5 }} onPress={() => setDropdownVisible(post.post_id)}>
                                <MaterialCommunityIcons name="dots-vertical" color={theme.textPrimary} size={24} />
                            </Pressable>
                            <DropDown
                                isVisible={dropdownVisible === post.post_id}
                                isOwner={userID === post.user_id}
                                postId={post.post_id}
                                onClose={() => setDropdownVisible(null)}
                                onPostDeleted={() => router.back()}
                                onReportResult={(reported?: boolean, msg?: string) => {
                                    setDropdownVisible(null);
                                    if (msg) setToastConfig({ visible: true, message: msg, isSuccess: false });
                                    else if (reported) setToastConfig({ visible: true, message: 'Report submitted', isSuccess: true });
                                }}
                            />
                        </View>
                    </View>

                    {hasMedia && (
                        <View style={styles.mediaPlaceholder}>
                            {mediaItems.length > 1 ? (
                                <View style={{ position: "relative" }}>
                                    <FlatList
                                        data={mediaItems}
                                        horizontal
                                        pagingEnabled
                                        showsHorizontalScrollIndicator={false}
                                        keyExtractor={item => item.id.toString()}
                                        onMomentumScrollEnd={(e) => setCurrentMediaIndex(Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 28)))}
                                        renderItem={({ item }) => (
                                            <DetailMediaItem 
                                                item={item} 
                                                postId={post.post_id} 
                                                onLike={toggleLike} 
                                                isLiked={isLiked} 
                                                dynamicHeight={eventImageHeight || undefined} 
                                                styles={styles}
                                            />
                                        )}
                                    />
                                    <View style={styles.pageIndicator}>
                                        <Text style={styles.pageIndicatorText}>{currentMediaIndex + 1}/{mediaItems.length}</Text>
                                    </View>
                                </View>
                            ) : (
                                <DetailMediaItem 
                                    item={mediaItems[0]} 
                                    postId={post.post_id} 
                                    onLike={toggleLike} 
                                    isLiked={isLiked} 
                                    dynamicHeight={eventImageHeight || undefined} 
                                    styles={styles}
                                />
                            )}

                            <View style={styles.imageBadges}>
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
                            </View>
                        </View>
                    )}

                    <View style={styles.metaRow}>
                        <View style={styles.metaChip}>
                            <Clock size={12} color="#666" />
                            <Text style={styles.metaText}>{timeAgo(post.create_at)}</Text>
                        </View>
                        {post.is_comments_enabled && (
                            <View style={styles.metaChip}>
                                <MessageCircle size={12} color="#666" />
                                <Text style={styles.metaText}>Comments on</Text>
                            </View>
                        )}
                        {post.location && (
                            <View style={styles.metaChip}>
                                <MapPin size={12} color="#666" />
                                <Text style={styles.metaText}>{post.location}</Text>
                            </View>
                        )}
                    </View>

                    {post.about && (
                        <View style={styles.postContent}>
                            <Hyperlink linkStyle={{ color: "#A78BFA" }} onPress={(url: string) => Linking.openURL(url)}>
                                <Text style={styles.postText}>{post.about}</Text>
                            </Hyperlink>
                        </View>
                    )}

                    {isLumaEvent && post.luma_event_url && (
                        <View style={{ marginBottom: 12, padding: 14, backgroundColor: "rgba(168,85,247,0.1)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(168,85,247,0.2)" }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                    <Calendar size={16} color="#d8b4fe" />
                                    <Text style={{ color: "#d8b4fe", fontSize: 13, fontFamily: "Dank Mono Bold" }}>
                                        {formatEventDate(post.luma_event_start_time || "")}
                                    </Text>
                                </View>
                            </View>
                            
                            {(() => {
                                const isPending = post.event_request_status === "pending";
                                const isApproved = post.event_request_status === "approved";
                                const isOwner = post.user_id === userID;

                                if (isApproved || isOwner) {
                                    return (
                                        <Pressable onPress={() => Linking.openURL(post.luma_event_url!)} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(168,85,247,0.2)", padding: 10, borderRadius: 8, justifyContent: "center" }}>
                                            <Link2 size={16} color="#d8b4fe" />
                                            <Text style={{ color: "#d8b4fe", fontFamily: "Dank Mono Bold" }}>View Event on Luma</Text>
                                        </Pressable>
                                    );
                                }

                                return (
                                    <Pressable disabled={isPending} onPress={handleRequestToAttend} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(168,85,247,0.2)", padding: 10, borderRadius: 8, justifyContent: "center", opacity: isPending ? 0.7 : 1 }}>
                                        <Text style={{ color: "#d8b4fe", fontFamily: "Dank Mono Bold" }}>{isPending ? "Requested" : "Request to Attend"}</Text>
                                    </Pressable>
                                );
                            })()}
                        </View>
                    )}

                    <View style={styles.postFooter}>
                        <Pressable onPress={toggleLike} style={styles.likesContainer}>
                            <Heart size={26} color={isLiked ? "#A855F7" : theme.textPrimary} fill={isLiked ? "#A855F7" : "transparent"} />
                            <Text style={[styles.likesCount, { fontSize: 16 }, isLiked && { color: "#A855F7" }]}>{formatNumber(likeCount)}</Text>
                        </Pressable>
                        <Pressable onPress={() => setShowPopup(true)} style={[styles.likesContainer, { marginLeft: 10 }]}>
                            <MessageCircle size={26} color={theme.textPrimary} />
                            <Text style={[styles.likesCount, { fontSize: 16 }]}>{formatNumber(post.comments_count)}</Text>
                        </Pressable>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}