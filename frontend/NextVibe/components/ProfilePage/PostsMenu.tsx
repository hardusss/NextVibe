import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import {
    View,
    FlatList,
    FlatListProps,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Text,
    Animated,
    Easing,
    Platform,
} from "react-native";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getMenuPosts from "@/src/api/menu.posts";
import { useIsFocused } from "@react-navigation/native";

import { BlurView } from "expo-blur";
import LiquidGlassView from '@/components/Shared/LiquidGlassView';
import GlassBadge from "@/components/Shared/GlassBadge";
import { Image } from 'expo-image';
import { ImageIcon, Video, Clock3, Sparkles, Gem, Calendar } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { storage } from '@/src/utils/storage';
import PostPopup from "./PostModal";
import PopupModal from "../Comments/CommentPopup";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import useWalletAddress from "@/hooks/useWalletAddress";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";
import useTransaction from "@/hooks/useTransaction";
import mintNFT from "@/src/api/mint.nft";

const screenWidth = Dimensions.get("window").width;
const padding = 20;
const imageSize = (screenWidth - padding * 2) / 3;
const ROW_HEIGHT = imageSize + 4;
const POSTS_PER_PAGE = 9;

interface PostMedia {
    media_url: string;
    media_preview: string | null;
}

interface Post {
    user_id: number;
    post_id: number;
    media: PostMedia[] | null;
    is_ai_generated: boolean;
    is_nft: boolean;
    moderation_status: string;
    is_luma_event?: boolean;
}

type MediaCheck =
    | { storage: string; is_video: true }
    | false;

interface PostGalleryProps {
    id: number;
    previous: string;
    ListHeaderComponent?: FlatListProps<Post>["ListHeaderComponent"];
    ListEmptyComponent?: FlatListProps<Post>["ListEmptyComponent"];
    refreshControl?: FlatListProps<Post>["refreshControl"];
    contentInset?: FlatListProps<Post>["contentInset"];
    contentOffset?: FlatListProps<Post>["contentOffset"];
    contentInsetAdjustmentBehavior?: FlatListProps<Post>["contentInsetAdjustmentBehavior"];
    automaticallyAdjustContentInsets?: FlatListProps<Post>["automaticallyAdjustContentInsets"];
    ownsScroll?: boolean;
}

// ── Module-level cache to survive tab-switch remounts ──
// Keyed by profile user id so own-profile and other-profile caches don't collide
const postsCache = new Map<number, Post[]>();
const fetchedProfiles = new Set<number>();

export const clearPostsCache = () => {
    postsCache.clear();
    fetchedProfiles.clear();
};

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

function ModerationDot({ delay }: { delay: number }) {
    const opacity = useRef(new Animated.Value(0.25)).current;
    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.ease),
                }),
                Animated.timing(opacity, {
                    toValue: 0.25,
                    duration: 400,
                    useNativeDriver: true,
                    easing: Easing.in(Easing.ease),
                }),
                Animated.delay(840 - delay),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, []);

    return (
        <Animated.View
            style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(168,85,247,0.8)',
                opacity,
                marginHorizontal: 2,
            }}
        />
    );
}

interface PostGridCellProps {
    item: Post;
    isFocused: boolean;
    currentUserId: number | null;
    onPress: (item: Post) => void;
}

const PostGridCell = memo(({ item, isFocused, currentUserId, onPress }: PostGridCellProps) => {
    const hasMedia = item.media && Array.isArray(item.media) && item.media.length > 0 && item.media[0]?.media_url;
    const isMediaVideo = hasMedia && item.media ? isVideo(item.media[0].media_url) : false;
    const mediaUrl = hasMedia && item.media ? item.media[0].media_url : null;
    const isApproved = item.moderation_status === "approved";
    const isPending = item.moderation_status === "pending" && item.user_id === currentUserId;
    const hasBadges = item.is_nft || item.is_ai_generated || item.is_luma_event;

    return (
        <TouchableOpacity
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.postContainer}
            onPress={() => isApproved ? onPress(item) : null}
            activeOpacity={isApproved ? 0.8 : 1}
        >
            {hasMedia ? (
                isMediaVideo ? (
                    <View style={styles.videoContainer}>
                        {item.is_luma_event && (
                            <>
                                <Image source={{ uri: getPreviewUrl(mediaUrl!, item) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                            </>
                        )}
                        <Image
                            source={{ uri: getPreviewUrl(mediaUrl!, item) }}
                            style={styles.media}
                            contentFit={item.is_luma_event ? "contain" : "cover"}
                        />
                    </View>
                ) : (
                    <View style={styles.videoContainer}>
                        {item.is_luma_event && (
                            <>
                                <Image source={{ uri: mediaUrl! }} style={StyleSheet.absoluteFill} contentFit="cover" />
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                            </>
                        )}
                        <Image
                            source={{ uri: mediaUrl! }}
                            style={styles.media}
                            contentFit={item.is_luma_event ? "contain" : "cover"}
                        />
                    </View>
                )
            ) : (
                <View style={styles.placeholderContainer}>
                    <LinearGradient
                        colors={["rgba(109,40,217,0.05)", "rgba(20,8,41,0.9)"]}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.placeholderInner}>
                        <ImageIcon size={26} color="rgba(167,139,250,0.8)" strokeWidth={1.2} />
                    </View>
                    <Text style={styles.placeholderText}>No media</Text>
                </View>
            )}

            {hasMedia && isApproved && (isMediaVideo || hasBadges) && (
                <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.55)"]}
                    style={styles.bottomGradient}
                    pointerEvents="none"
                />
            )}

            {isPending && isFocused && (
                <View style={styles.moderationOverlay}>
                    {Platform.OS === 'ios' ? (
                        <LiquidGlassView
                            style={StyleSheet.absoluteFill}
                            glassEffectStyle="regular"
                            colorScheme="dark"
                            pointerEvents="none"
                            fallbackBackgroundColor="rgba(10, 10, 10, 0.7)"
                        />
                    ) : (
                        <BlurView
                            style={StyleSheet.absoluteFill}
                            tint="dark"
                            intensity={60}
                            experimentalBlurMethod="dimezisBlurView"
                            pointerEvents="none"
                        />
                    )}
                    <View style={styles.moderationContent}>
                        <View style={styles.moderationIconWrap}>
                            <Clock3
                                size={15}
                                color="rgba(196,181,253,0.9)"
                                strokeWidth={1.8}
                            />
                        </View>
                        <Text style={styles.moderationText}>reviewing</Text>
                        <View style={styles.moderationDots}>
                            <ModerationDot delay={0} />
                            <ModerationDot delay={280} />
                            <ModerationDot delay={560} />
                        </View>
                    </View>
                </View>
            )}

            {hasMedia && isApproved && (
                <View style={styles.badgeRow}>
                    {isMediaVideo && (
                        <GlassBadge variant="grid" iconOnly>
                            <Video size={11} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                        </GlassBadge>
                    )}
                    {item.is_nft && (
                        <GlassBadge variant="grid-nft" iconOnly>
                            <Gem size={11} color="#c4b5fd" strokeWidth={2} />
                        </GlassBadge>
                    )}
                    {item.is_ai_generated && (
                        <GlassBadge variant="grid-ai" iconOnly>
                            <Sparkles size={11} color="#05f0d8" strokeWidth={2} />
                        </GlassBadge>
                    )}
                    {item.is_luma_event && (
                        <GlassBadge variant="grid-event" iconOnly>
                            <Calendar size={11} color="#d8b4fe" strokeWidth={2} />
                        </GlassBadge>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
});

PostGridCell.displayName = "PostGridCell";

const PostGallery = ({
    id,
    previous,
    ListHeaderComponent,
    ListEmptyComponent,
    refreshControl,
    contentInset,
    contentOffset,
    contentInsetAdjustmentBehavior,
    automaticallyAdjustContentInsets,
    ownsScroll = true,
}: PostGalleryProps) => {
    const isFocused = useIsFocused();
    const cached = postsCache.get(id) ?? null;
    const [posts, setPosts] = useState<Post[]>(cached ?? []);
    const [loading, setLoading] = useState(!cached);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const indexRef = useRef(cached ? cached.length : 0);
    const [userID, setUserID] = useState<number | null>(null);
    const isFetchingRef = useRef(false);

    const [popupVisible, setPopupVisible] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
    const [commentsPostId, setCommentsPostId] = useState<number | null>(null);

    const mintSheetRef = useRef<MintBottomSheetRef>(null);
    const [mintPostId, setMintPostId] = useState<number | null>(null);
    const [mintImageUrl, setMintImageUrl] = useState<string | null>(null);
    const [mintCreator, setMintCreator] = useState<string>("");
    const [mintIsOwner, setMintIsOwner] = useState(false);
    const [mintDefaultPrice, setMintDefaultPrice] = useState<string | null>(null);
    const [mintOwnerWallet, setMintOwnerWallet] = useState<string | null>(null);
    const [mintMintedCount, setMintMintedCount] = useState<number>(0);
    const { sendInstructions } = useTransaction();
    const { address } = useWalletAddress();
    const [mintSuccessId, setMintSuccessId] = useState<number | null>(null);

    useEffect(() => {
        if (!isFocused) {
            const checkLogout = async () => {
                const storedId = await storage.getItem("id");
                if (!storedId) {
                    setPopupVisible(false);
                    setSelectedPostId(null);
                    setCommentsPostId(null);
                    setMintPostId(null);
                }
            };
            checkLogout();
        }
    }, [isFocused]);

    const getId = async () => {
        const storedId = await storage.getItem("id");
        const parsedId = Number(storedId);
        setUserID(parsedId);
        return parsedId;
    };

    const fetchPosts = useCallback(async (shouldLoadMore = false, currentUserID?: number) => {
        if (isFetchingRef.current || !hasMore) return;

        isFetchingRef.current = true;
        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const response = await getMenuPosts(id, indexRef.current, POSTS_PER_PAGE);
            const newPosts = response.data;
            setHasMore(response.more_posts);

            setPosts((prevPosts) => {
                const actualUserID = currentUserID ?? userID;

                const filteredNewPosts = newPosts.filter(
                    (p: any) =>
                        p.moderation_status === "approved" ||
                        (p.moderation_status === "pending" && p.user_id === actualUserID)
                );

                let result: Post[];
                if (shouldLoadMore) {
                    const uniquePosts = new Map(prevPosts.map(post => [post.post_id, post]));
                    filteredNewPosts.forEach((post: any) => uniquePosts.set(post.post_id, post));
                    result = Array.from(uniquePosts.values());
                } else {
                    result = filteredNewPosts;
                }

                // Update per-profile cache
                postsCache.set(id, result);
                return result;
            });

            indexRef.current = shouldLoadMore
                ? indexRef.current + POSTS_PER_PAGE
                : POSTS_PER_PAGE;
        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isFetchingRef.current = false;
        }
    }, [hasMore, id, userID]);

    // Load once on mount — don't re-fetch on every tab focus
    useEffect(() => {
        if (fetchedProfiles.has(id) && postsCache.has(id)) return;
        fetchedProfiles.add(id);
        indexRef.current = 0;
        getId().then((fetchedUserID) => {
            fetchPosts(false, fetchedUserID);
        }).catch(() => {
            fetchedProfiles.delete(id);
        });
    }, []);

    const handlePostPress = useCallback((item: Post) => {
        if (item.moderation_status !== "approved") return;
        setSelectedPostId(item.post_id);
        setPopupVisible(true);
    }, []);

    const handleOpenMint = (
        postId: number,
        imageUrl: string | null,
        creator: string,
        nftPrice: string | null,
        isOwner: boolean,
        alreadyClaimed: boolean,
        ownerWallet: string | null,
        mintedCount: number
    ) => {
        setMintPostId(postId);
        setMintImageUrl(imageUrl);
        setMintCreator(creator);
        setMintIsOwner(isOwner);
        setMintDefaultPrice(nftPrice);
        setMintOwnerWallet(ownerWallet);
        setMintMintedCount(mintedCount);
        setTimeout(() => mintSheetRef.current?.present(), 50);
    };

    const handleMint = async (postId: number, price: number) => {
        if (!address) throw new Error("Wallet not connected");

        let paymentSignature: string | null = null;

        if (mintMintedCount === 0 && mintIsOwner) {
            paymentSignature = null;
        } else if (!mintIsOwner) {
            if (!mintOwnerWallet) throw new Error("Owner wallet not found");

            const ixs = buildMintPaymentInstructions(address, mintOwnerWallet, price);
            paymentSignature = await sendInstructions(ixs, `user-profile?id=${id}`);

            if (!paymentSignature) throw new Error("Payment was not confirmed");
        }

        await mintNFT(address, postId, price, paymentSignature as string);
        // Signal PostPopup to update collect button state
        setMintSuccessId(postId);
    };

    const keyExtractor = useCallback((item: Post, index: number) => item.post_id?.toString() ?? `post-${index}`, []);

    const renderItem = useCallback(({ item }: { item: Post }) => (
        <PostGridCell
            item={item}
            isFocused={isFocused}
            currentUserId={userID}
            onPress={handlePostPress}
        />
    ), [handlePostPress, isFocused, userID]);

    const handleEndReached = useCallback(() => {
        fetchPosts(true);
    }, [fetchPosts]);

    const getItemLayout = useCallback((_data: ArrayLike<Post> | null | undefined, index: number) => {
        const row = Math.floor(index / 3);
        return { length: ROW_HEIGHT, offset: ROW_HEIGHT * row, index };
    }, []);

    return (
        <View style={styles.container}>
            <PostPopup
                visible={popupVisible}
                postId={selectedPostId}
                onClose={() => setPopupVisible(false)}
                currentUserId={userID ?? undefined}
                onOpenComments={(id) => setCommentsPostId(id)}
                onOpenMint={handleOpenMint}
                mintSuccessPostId={mintSuccessId}
                isFocused={isFocused}
            />

            {commentsPostId !== null && (
                <PopupModal
                    post_id={commentsPostId}
                    onClose={() => setCommentsPostId(null)}
                    isCommentsEnabled={true}
                    isFocused={isFocused}
                />
            )}

            <MintBottomSheet
                ref={mintSheetRef}
                postId={mintPostId ?? 0}
                imageUrl={mintImageUrl}
                creatorUsername={mintCreator}
                walletConnected={!!address}
                onMint={handleMint}
                isOwner={mintIsOwner}
                defaultPrice={mintDefaultPrice}
                page={`user-profile?id=${id}`}
                isFocused={isFocused}
            />

            <FlatList
                data={loading ? [] : posts}
                keyExtractor={keyExtractor}
                numColumns={3}
                scrollEnabled={ownsScroll}
                initialNumToRender={9}
                maxToRenderPerBatch={9}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                getItemLayout={ListHeaderComponent ? undefined : getItemLayout}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                columnWrapperStyle={{ paddingHorizontal: 14 }}
                ListHeaderComponent={ListHeaderComponent}
                ListEmptyComponent={loading ? <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} /> : ListEmptyComponent}
                renderItem={renderItem}
                onEndReached={handleEndReached}
                onEndReachedThreshold={1}
                refreshControl={refreshControl}
                contentInset={contentInset}
                contentOffset={contentOffset}
                contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
                automaticallyAdjustContentInsets={automaticallyAdjustContentInsets}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                    loadingMore
                        ? <ActivityIndicator size="small" color="#0000ff" style={{ marginVertical: 10 }} />
                        : null
                }
            />
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
        borderRadius: 12,
        backgroundColor: "#111",
    },
    placeholderContainer: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0d0514",
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: "rgba(109,40,217,0.4)",
        borderStyle: "dashed",
    },
    placeholderInner: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: "rgba(109,40,217,0.15)",
        borderWidth: 1,
        borderColor: "rgba(167,139,250,0.3)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 8,
    },
    placeholderText: {
        color: "rgba(167,139,250,0.6)",
        fontSize: 10,
        fontFamily: "Dank Mono Bold",
        letterSpacing: 0.5,
    },
    media: {
        width: "100%",
        height: "100%",
        borderRadius: 12,
    },
    videoContainer: {
        width: "100%",
        height: "100%",
    },
    bottomGradient: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "45%",
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    moderationOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        zIndex: 9999,
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(168,85,247,0.25)',
    },
    moderationContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
    },
    moderationIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(168,85,247,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 2,
    },
    moderationText: {
        color: 'rgba(196,181,253,0.75)',
        fontSize: 9,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    moderationDots: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    badgeRow: {
        position: "absolute",
        bottom: 6,
        right: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    badge: {
        width: 20,
        height: 20,
        borderRadius: 6,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
    },
    badgeNft: {
        backgroundColor: "rgba(109,40,217,0.45)",
        borderColor: "rgba(196,181,253,0.25)",
    },
    badgeAi: {
        backgroundColor: "rgba(5,240,216,0.15)",
        borderColor: "rgba(5,240,216,0.25)",
    },
    badgeEvent: {
        backgroundColor: "rgba(168,85,247,0.25)",
        borderColor: "rgba(168,85,247,0.4)",
    },
});

export default PostGallery;
