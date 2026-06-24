import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    FlatList,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
    useColorScheme,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, Clock, Heart, Link2, MapPin, Sparkles, ArrowLeft, MoreVertical, MessageSquareOff, MessageSquare } from "lucide-react-native";
import Hyperlink from "react-native-hyperlink";

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


import { ActivityIndicator as CustomActivityIndicator } from "../CustomActivityIndicator";
import DropDown from "../Shared/Posts/PostsDropdown";
import Web3Toast from "../Shared/Toasts/Web3Toast";
import VerifyBadge from "../VerifyBadge";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import ButtonCollect, { CollectState } from "../NftClaim/ButtonCollect";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";

import PhotoModal from "./PhotoModal";
import PostMediaItem from "./PostMediaItem";
import { CommentItem, Comment, Reply, LikedComments } from "./CommentThread";
import CommentInput from "./CommentInput";
import { PostData } from "@/src/types/post";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SW } = Dimensions.get("window");




interface UserData {
    username: string;
    avatar: string | null;
    liked_comments: number[];
    liked_comment_replies: number[];
}


const dark = {
    background: "#0A0410", textPrimary: "#E3E3E3", textSecondary: "#888",
    accentColor: "#58a6ff", border: "rgba(255,255,255,0.06)",
    inputBg: "rgba(255,255,255,0.05)", threadLine: "rgba(255,255,255,0.1)",
};
const light = {
    background: "#ffffff", textPrimary: "#111", textSecondary: "#666",
    accentColor: "#0095f6", border: "rgba(0,0,0,0.07)",
    inputBg: "rgba(0,0,0,0.04)", threadLine: "rgba(0,0,0,0.12)",
};

const formatEventDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

const PostHeader = ({ title, isDark, insets, onBack }: { title: string, isDark: boolean, insets: any, onBack: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 10, paddingBottom: 10 }}>
        <TouchableOpacity onPress={onBack} style={{ padding: 8, marginRight: 12 }}>
            <ArrowLeft size={24} color={isDark ? "#fff" : "#000"} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Dank Mono Bold", color: isDark ? "#fff" : "#000" }}>{title}</Text>
    </View>
);


export default function PostDetailsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id, commentId, replyId } = useLocalSearchParams();
    const highlightedCommentId = commentId ? Number(Array.isArray(commentId) ? commentId[0] : commentId) : null;
    const highlightedReplyId = replyId ? Number(Array.isArray(replyId) ? replyId[0] : replyId) : null;

    const isDark = useColorScheme() === "dark";
    const theme = isDark ? dark : light;

    const [post, setPost] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [userID, setUserID] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [toastConfig, setToastConfig] = useState({ visible: false, message: "", isSuccess: true });

    const [photoModalVisible, setPhotoModalVisible] = useState(false);
    const [photoModalIndex, setPhotoModalIndex] = useState(0);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [likedComments, setLikedComments] = useState<LikedComments>({ comments: {}, replies: {} });
    const [replyingTo, setReplyingTo] = useState<Comment | Reply | null>(null);
    const [commentText, setCommentText] = useState("");
    const [postAuthor, setPostAuthor] = useState<string | null>(null);

    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const likingRef = useRef(false);
    const { address } = useWalletAddress();
    const { sendInstructions } = useTransaction();

    useEffect(() => {
        if (!id) return;
        (async () => {
            const storedId = await storage.getItem("id");
            setUserID(storedId ? +storedId : 0);
            fetchPost();
            fetchComments();
            fetchUser();
        })();
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
                setPostAuthor(data.author ?? null);
                setComments(data.comments);
            }
        } finally { setCommentsLoading(false); }
    };

    const fetchUser = async () => {
        const u = await getUserDetail();
        setUserData(u);
        setLikedComments({
            comments: u.liked_comments.reduce((a: Record<number, boolean>, id: number) => ({ ...a, [id]: true }), {}),
            replies: u.liked_comment_replies.reduce((a: Record<number, boolean>, id: number) => ({ ...a, [id]: true }), {}),
        });
    };

    const toggleLike = useCallback(async () => {
        if (!post || likingRef.current) return;
        likingRef.current = true;

        const wasLiked = isLiked;

        // Optimistic UI updates
        setIsLiked((p) => !p);
        setLikeCount((p) => (wasLiked ? p - 1 : p + 1));

        try {
            await likePost(post.post_id);
        } catch (error) {
            console.error("Error toggling like for post details", error);
            // Revert state
            setIsLiked(wasLiked);
            setLikeCount((p) => (wasLiked ? p + 1 : p - 1));
        } finally {
            likingRef.current = false;
        }
    }, [isLiked, post]);

    /**
     * Optimistic like/unlike for both comments and their nested replies.
     *
     * The `wasLiked` snapshot is captured before the async API call so the +1/-1
     * delta stays correct even if the user taps again before the first request settles.
     * After the call we patch both the icon state map (`likedComments`) and the
     * `count_likes` counter on the exact node inside the comment tree.
     */
    const toggleCommentLike = useCallback(async (item: Comment | Reply) => {
        const isReply = "reply_id" in item;
        const wasLiked = isReply
            ? likedComments.replies[(item as Reply).reply_id]
            : likedComments.comments[(item as Comment).id];

        await commentLike(isReply ? (item as Reply).reply_id : (item as Comment).id, isReply);

        setLikedComments((prev) => {
            if (isReply) {
                const rid = (item as Reply).reply_id;
                return { ...prev, replies: { ...prev.replies, [rid]: !prev.replies[rid] } };
            }
            const cid = (item as Comment).id;
            return { ...prev, comments: { ...prev.comments, [cid]: !prev.comments[cid] } };
        });

        setComments((prev) =>
            prev.map((c) => {
                if (isReply) {
                    const rid = (item as Reply).reply_id;
                    if (!c.replies.some((r) => r.reply_id === rid)) return c;
                    return {
                        ...c,
                        replies: c.replies.map((r) =>
                            r.reply_id === rid
                                ? { ...r, count_likes: r.count_likes + (wasLiked ? -1 : 1) }
                                : r,
                        ),
                    };
                }
                if (c.id === (item as Comment).id) {
                    return { ...c, count_likes: c.count_likes + (wasLiked ? -1 : 1) };
                }
                return c;
            }),
        );
    }, [likedComments]);

    /**
     * Sends a top-level comment or a reply.
     *
     * When replying to a Reply (not a root Comment), the API expects the parent
     * Comment's ID — not the reply's own ID. We walk the tree to find it, falling
     * back to the reply's ID only as a safety net.
     */
    const handleSendComment = async () => {
        if (!commentText.trim() || !post?.is_comments_enabled) return;

        if (replyingTo === null) {
            const res = await createComment(commentText, post.post_id);
            setComments((p) => [res, ...p]);
        } else {
            const isReply = "reply_id" in replyingTo;
            const commentId = isReply
                ? (comments.find((c) => c.replies.some((r) => r.reply_id === (replyingTo as Reply).reply_id))?.id ?? (replyingTo as Reply).reply_id)
                : (replyingTo as Comment).id;

            const res = await createCommentReply(commentText, commentId);
            if (res) {
                setComments((p) => p.map((c) => c.id === commentId ? { ...c, replies: [...c.replies, res] } : c));
            }
            setReplyingTo(null);
        }
        setCommentText("");
    };

    const handleRequestToAttend = async () => {
        if (!post) return;
        try {
            await requestToAttend(post.post_id);
            setPost((p) => p ? { ...p, event_request_status: "pending" } : null);
            setToastConfig({ visible: true, message: "Request to attend sent!", isSuccess: true });
        } catch (e: any) {
            setToastConfig({ visible: true, message: e.response?.data?.error ?? "Failed", isSuccess: false });
        }
    };

    /**
     * Two distinct payment paths depending on who is minting:
     * - Owner minting their own post → no SOL transfer, call the API directly.
     * - Collector → build on-chain payment instructions, send the transaction, then
     *   confirm the mint on the backend with the transaction signature as proof of payment.
     */
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
            <View style={[s.container, { backgroundColor: theme.background }]}>
                <PostHeader title="Post" isDark={isDark} insets={insets} onBack={() => router.back()} />
                <View style={s.loadingContainer}>
                    <CustomActivityIndicator size="large" color={theme.accentColor} />
                </View>
            </View>
        );
    }

    if (!post) return null;

    const mediaItems = post.media ?? [];
    const hasMedia = mediaItems.length > 0;
    const totalComments = comments.reduce((t, c) => t + 1 + (c.replies?.length ?? 0), 0);

    let collectState: CollectState | null = null;
    if (post.is_nft || post.is_owner) {
        collectState = post.already_claimed ? "claimed" : post.sold_out ? "soldout" : "collect";
    };


    return (
        <View style={[s.container, { backgroundColor: theme.background }]}>
            <StatusBar backgroundColor={theme.background} barStyle={isDark ? "light-content" : "dark-content"} />
            <View style={{ paddingLeft: 12 }}>
                <PostHeader title="Post" isDark={isDark} insets={insets} onBack={() => router.back()} />
            </View>

            <Web3Toast
                message={toastConfig.message}
                visible={toastConfig.visible}
                onHide={() => setToastConfig((p) => ({ ...p, visible: false }))}
                isSuccess={toastConfig.isSuccess}
            />

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

            <PhotoModal
                visible={photoModalVisible}
                images={mediaItems}
                initialIndex={photoModalIndex}
                onClose={() => setPhotoModalVisible(false)}
            />

            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={s.postContainer}>

                    {/* Header */}
                    <View style={s.postHeader}>
                        <TouchableOpacity onPress={() => router.push({ pathname: "/user-profile", params: { id: post.user_id } })}>
                            <AvatarWithFrame avatarUrl={post.avatar} size={42} isOg={post.is_og} ogEdition={post.og_edition} invitedCount={post.invited_count} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={[s.username, { color: theme.textPrimary }]}>{post.username}</Text>
                                {post.official && (
                                    <View style={{ marginLeft: 2 }}>
                                        <VerifyBadge isLooped isVisible haveModal={false} isStatic={false} size={16} />
                                    </View>
                                )}
                            </View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {collectState !== null && !post.is_luma_event && (
                                <ButtonCollect
                                    onPress={() => mintSheetRef.current?.present()}
                                    state={collectState}
                                    supplyLabel={`${post.minted_count ?? 0}/${post.total_supply ?? 50}`}
                                />
                            )}
                            <Pressable style={{ padding: 6 }} onPress={() => setDropdownOpen(true)}>
                                <MoreVertical color={theme.textPrimary} size={24} />
                            </Pressable>
                            <DropDown
                                isVisible={dropdownOpen}
                                isOwner={userID === post.user_id}
                                postId={post.post_id}
                                onClose={() => setDropdownOpen(false)}
                                onPostDeleted={() => router.back()}
                                onReportResult={(reported, msg) => {
                                    setDropdownOpen(false);
                                    if (msg) setToastConfig({ visible: true, message: msg, isSuccess: false });
                                    else if (reported) setToastConfig({ visible: true, message: "Report submitted", isSuccess: true });
                                }}
                            />
                        </View>
                    </View>

                    {/* Media gallery */}
                    {hasMedia && (
                        <View style={s.mediaWrapper}>
                            {mediaItems.length > 1 ? (
                                <View>
                                    <FlatList
                                        data={mediaItems}
                                        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                                        keyExtractor={(item) => item.id.toString()}
                                        onMomentumScrollEnd={(e) =>
                                            setCurrentMediaIndex(Math.round(e.nativeEvent.contentOffset.x / (SW - 32)))
                                        }
                                        renderItem={({ item, index }) => (
                                            <PostMediaItem
                                                item={item}
                                                isLiked={isLiked}
                                                onLike={toggleLike}
                                                onOpenPhoto={() => { setPhotoModalIndex(index); setPhotoModalVisible(true); }}
                                            />
                                        )}
                                    />
                                    <View style={s.pageIndicator}>
                                        <Text style={s.pageIndicatorText}>{currentMediaIndex + 1}/{mediaItems.length}</Text>
                                    </View>
                                </View>
                            ) : (
                                <PostMediaItem
                                    item={mediaItems[0]}
                                    isLiked={isLiked}
                                    onLike={toggleLike}
                                    onOpenPhoto={() => { setPhotoModalIndex(0); setPhotoModalVisible(true); }}
                                />
                            )}
                            <View style={s.imageBadges} pointerEvents="none">
                                {post.is_ai_generated && (
                                    <View style={s.badge}>
                                        <Sparkles size={11} color="#05f0d8" />
                                        <Text style={s.badgeText}>AI</Text>
                                    </View>
                                )}
                                {post.is_nft && (
                                    <View style={[s.badge, s.nftBadge]}>
                                        <Text style={s.nftBadgeText}>{post.minted_count}/{post.total_supply} minted</Text>
                                    </View>
                                )}
                                {post.location && (
                                    <View style={s.badge}>
                                        <MapPin size={11} color="#fff" />
                                        <Text style={s.badgeText}>{post.location}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Body text */}
                    {!!post.about && (
                        <View style={{ marginBottom: 12 }}>
                            <Hyperlink linkStyle={{ color: "#A78BFA" }} onPress={(url) => Linking.openURL(url)}>
                                <Text style={[s.postText, { color: theme.textPrimary }]}>{post.about}</Text>
                            </Hyperlink>
                        </View>
                    )}

                    {/* Meta chips */}
                    <View style={s.metaRow}>
                        <View style={s.metaChip}>
                            <Clock size={12} color={theme.textSecondary} />
                            <Text style={[s.metaText, { color: theme.textSecondary }]}>{timeAgo(post.create_at)}</Text>
                        </View>
                        {post.location && !hasMedia && (
                            <View style={s.metaChip}>
                                <MapPin size={12} color={theme.textSecondary} />
                                <Text style={[s.metaText, { color: theme.textSecondary }]}>{post.location}</Text>
                            </View>
                        )}
                    </View>

                    {/* Luma event card */}
                    {post.is_luma_event && post.luma_event_url && (() => {
                        const isPending = post.event_request_status === "pending";
                        const isApproved = post.event_request_status === "approved";
                        const isOwner = post.user_id === userID;
                        return (
                            <View style={s.lumaCard}>
                                {post.luma_event_start_time && (
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                        <Calendar size={15} color="#d8b4fe" />
                                        <Text style={s.lumaText}>{formatEventDate(post.luma_event_start_time)}</Text>
                                    </View>
                                )}
                                {isApproved || isOwner ? (
                                    <Pressable onPress={() => Linking.openURL(post.luma_event_url!)} style={s.lumaBtn}>
                                        <Link2 size={16} color="#d8b4fe" />
                                        <Text style={s.lumaText}>View Event on Luma</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        disabled={isPending}
                                        onPress={handleRequestToAttend}
                                        style={[s.lumaBtn, isPending && { opacity: 0.7 }]}
                                    >
                                        <Text style={s.lumaText}>{isPending ? "Requested" : "Request to Attend"}</Text>
                                    </Pressable>
                                )}
                            </View>
                        );
                    })()}

                    {/* Stats */}
                    <View style={[s.statsRow, { borderTopColor: theme.border }]}>
                        <View style={s.statItem}>
                            <Text style={[s.statCount, { color: theme.textPrimary }]}>{formatNumber(likeCount)}</Text>
                            <Text style={[s.statLabel, { color: theme.textSecondary }]}>Likes</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={[s.statCount, { color: theme.textPrimary }]}>{formatNumber(totalComments)}</Text>
                            <Text style={[s.statLabel, { color: theme.textSecondary }]}>Comments</Text>
                        </View>
                        {post.is_nft && (
                            <View style={s.statItem}>
                                <Text style={[s.statCount, { color: "#d8b4fe" }]}>{post.minted_count}</Text>
                                <Text style={[s.statLabel, { color: theme.textSecondary }]}>Minted</Text>
                            </View>
                        )}
                    </View>

                    {/* Like action */}
                    <View style={[s.actionsRow, { borderColor: theme.border }]}>
                        <Pressable onPress={toggleLike} style={{ padding: 4 }}>
                            <Heart size={26} color={isLiked ? "#A855F7" : theme.textPrimary} fill={isLiked ? "#A855F7" : "transparent"} />
                        </Pressable>
                    </View>
                </View>

                {/* Comments section */}
                <View style={s.commentsHeading}>
                    <Text style={[s.commentsHeadingText, { color: theme.textPrimary }]}>
                        {post.is_comments_enabled
                            ? totalComments > 0 ? `Comments · ${totalComments}` : "Comments"
                            : "Comments disabled"}
                    </Text>
                </View>
                <View style={[s.divider, { backgroundColor: theme.border }]} />

                {commentsLoading ? (
                    <View style={{ paddingVertical: 36, alignItems: "center" }}>
                        <CustomActivityIndicator size="large" color="#A855F7" />
                    </View>
                ) : !post.is_comments_enabled ? (
                    <View style={s.emptyState}>
                        <MessageSquareOff size={34} color={theme.textSecondary} />
                        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Comments are disabled</Text>
                    </View>
                ) : comments.length === 0 ? (
                    <View style={s.emptyState}>
                        <MessageSquare size={34} color={theme.textSecondary} />
                        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>No comments yet. Be the first!</Text>
                    </View>
                ) : (
                    comments.map((comment, idx) => (
                        <CommentItem
                            key={comment.id}
                            item={comment}
                            likedComments={likedComments}
                            onLike={toggleCommentLike}
                            onReply={(item) => setReplyingTo(item)}
                            theme={theme}
                            isLast={idx === comments.length - 1}
                            highlightedCommentId={highlightedCommentId}
                            highlightedReplyId={highlightedReplyId}
                        />
                    ))
                )}
            </ScrollView>

            {post.is_comments_enabled && (
                <CommentInput
                    avatarUrl={userData?.avatar}
                    commentText={commentText}
                    onChangeText={setCommentText}
                    onSend={handleSendComment}
                    replyingTo={replyingTo}
                    onCancelReply={() => setReplyingTo(null)}
                    postAuthor={postAuthor}
                    insets={insets}
                    theme={theme}
                />
            )}
        </View>
    );
};


const s = StyleSheet.create({
    container: {
        flex: 1
    },
    scrollContent: {
        paddingBottom: 120
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center"
    },
    postContainer: {
        paddingHorizontal: 16,
        paddingTop: 14
    },
    postHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12
    },
    username: {
        fontSize: 16,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false
    },

    mediaWrapper: {
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 12,
        position: "relative"
    },
    pageIndicator: {
        position: "absolute",
        right: 12,
        top: 10,
        backgroundColor: "rgba(0,0,0,0.55)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    pageIndicatorText: {
        color: "#fff",
        fontSize: 12
    },
    imageBadges: {
        position: "absolute",
        bottom: 12,
        left: 12,
        flexDirection: "row",
        gap: 6,
        flexWrap: "wrap"
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(0,0,0,0.8)",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
    },
    badgeText: {
        color: "#fff",
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false
    },
    nftBadge: {
        borderColor: "rgba(168,85,247,0.5)",
        backgroundColor: "rgba(30,0,50,0.85)"
    },
    nftBadgeText: {
        color: "#d8b4fe",
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false
    },

    postText: {
        fontSize: 15,
        lineHeight: 22
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 8
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    metaText: {
        fontSize: 12,
        fontFamily: "Dank Mono",
        includeFontPadding: false
    },

    lumaCard: {
        marginBottom: 14,
        padding: 14,
        backgroundColor: "rgba(168,85,247,0.08)",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(168,85,247,0.18)",
    },
    lumaBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "rgba(168,85,247,0.2)",
        padding: 10,
        borderRadius: 10,
        justifyContent: "center",
    },
    lumaText: {
        color: "#d8b4fe",
        fontSize: 13,
        fontFamily: "Dank Mono Bold"
    },

    statsRow: {
        flexDirection: "row",
        gap: 20,
        paddingVertical: 14,
        borderTopWidth: 1
    },
    statItem: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4
    },
    statCount: {
        fontSize: 16,
        fontFamily: "Dank Mono Bold"
    },
    statLabel: {
        fontSize: 14
    },
    actionsRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },

    commentsHeading: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 10
    },
    commentsHeadingText: {
        fontSize: 17,
        fontFamily: "Dank Mono Bold"
    },
    divider: {
        height: 1
    },
    emptyState: {
        paddingVertical: 40, 
        alignItems: "center", 
        gap: 10 
    },
});