import React, { useState, useRef } from "react";
import {
    View,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Text
} from "react-native";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getMenuPosts from "@/src/api/menu.posts";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BlurView } from "@react-native-community/blur";
import FastImage from 'react-native-fast-image';
import { Image, Video, Timer, Sparkles } from "lucide-react-native";
import { storage } from '@/src/utils/storage';
import PostPopup from "./PostModal";
import PopupModal from "../Comments/CommentPopup";
import MintBottomSheet, { MintBottomSheetRef } from "../NftClaim/MintBottomSheet";
import useWalletAddress from "@/hooks/useWalletAddress";
import { buildMintPaymentInstructions } from "@/hooks/buildPaymentInstructions";
import useTransaction from "@/hooks/useTransaction";
import mintNFT from "@/src/api/mint.nft";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3;

/** Single media item attached to a post */
interface PostMedia {
    media_url: string;
    media_preview: string | null;
}

/** Minimal post shape returned by the gallery feed API */
interface Post {
    user_id: number;
    post_id: number;
    media: PostMedia[] | null;
    is_ai_generated: boolean;
    moderation_status: string;
}

/**
 * Result of a video detection check.
 * Returns storage provider info when the URL is a video, false otherwise.
 */
type MediaCheck =
    | { storage: string; is_video: true }
    | false;

/** Props for the PostGallery component */
interface PostGalleryProps {
    /** User profile ID whose posts are displayed */
    id: number;
    /** Previous screen identifier used for navigation context */
    previous: string;
}

/**
 * PostGallery renders a 3-column grid of posts for a given user profile.
 *
 * Handles:
 * - Paginated post fetching with infinite scroll
 * - Post moderation filtering (approved + own pending)
 * - Post detail popup
 * - Comments bottom sheet
 * - cNFT minting bottom sheet with real Django + Elysia integration
 */
const PostGallery = ({ id, previous }: PostGalleryProps) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [index, setIndex] = useState(0);
    const [userID, setUserID] = useState<number | null>(null);

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
    const [mintMintedCount, setMintMintedCount] = useState<number>(0)
    const { sendInstructions } = useTransaction();
    /** Connected Solana wallet address from LazorKit / MWA */
    const { address } = useWalletAddress();

    const POSTS_PER_PAGE = 9;

    /**
     * Reads the authenticated user's ID from secure storage
     * and stores it in local state for ownership checks.
     */
    const getId = async () => {
        const storedId = await storage.getItem("id");
        const parsedId = Number(storedId);
        setUserID(parsedId);
        return parsedId;
    };

    /**
     * Fetches a page of posts for the profile.
     * Filters out posts that are pending moderation unless they belong to the current user.
     *
     * @param shouldLoadMore - Whether this is a pagination request or initial load
     * @param currentUserID  - User ID override used on first load before state is set
     */
    const fetchPosts = async (shouldLoadMore = false, currentUserID?: number) => {
        if (loadingMore || !hasMore) return;

        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const response = await getMenuPosts(id, index, POSTS_PER_PAGE);
            const newPosts = response.data;
            setHasMore(response.more_posts);

            setPosts((prevPosts) => {
                const actualUserID = currentUserID ?? userID;

                const filteredNewPosts = newPosts.filter(
                    (p: any) =>
                        p.moderation_status === "approved" ||
                        (p.moderation_status === "pending" && p.user_id === actualUserID)
                );

                if (shouldLoadMore) {
                    const uniquePosts = new Map(prevPosts.map(post => [post.post_id, post]));
                    filteredNewPosts.forEach((post: any) => uniquePosts.set(post.post_id, post));
                    return Array.from(uniquePosts.values());
                } else {
                    return filteredNewPosts;
                }
            });

            setIndex((prevIndex) => shouldLoadMore ? prevIndex + POSTS_PER_PAGE : POSTS_PER_PAGE);
        } catch (error) { }

        setLoading(false);
        setLoadingMore(false);
    };

    useFocusEffect(
        useCallback(() => {
            setPosts([]);
            setIndex(0);
            getId().then((fetchedUserID) => {
                fetchPosts(false, fetchedUserID);
            });
        }, [])
    );

    /**
     * Detects whether a media URL points to a video file.
     * Supports both Cloudinary video URLs and R2-hosted video extensions.
     *
     * @param url - Media URL to inspect
     * @returns MediaCheck object with storage provider, or false if not a video
     */
    const isVideo = (url: string): MediaCheck => {
        if (url.includes("/video/")) return { storage: "cloudinary", is_video: true };
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        if (videoExtensions.some(ext => url.endsWith(ext))) return { storage: "r2", is_video: true };
        return false;
    };

    /**
     * Generates a thumbnail preview URL for video media.
     * For Cloudinary videos, uses transformation params to extract the first frame.
     * For R2 videos, falls back to the pre-generated preview field.
     *
     * @param url  - Original media URL
     * @param item - Full post item (used to access media_preview for R2)
     * @returns Preview image URL
     */
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

    /**
     * Opens the post detail popup for an approved post.
     * Silently ignores taps on pending or rejected posts.
     *
     * @param item - Post item that was tapped
     */
    const handlePostPress = (item: Post) => {
        if (item.moderation_status !== "approved") return;
        setSelectedPostId(item.post_id);
        setPopupVisible(true);
    };

    /**
     * Prepares mint state and opens the MintBottomSheet.
     * Called from PostPopup when the user taps the Collect button.
     *
     * @param postId       - ID of the post to mint
     * @param imageUrl     - Thumbnail URL shown in the mint sheet preview
     * @param creator      - Username of the post owner
     * @param nftPrice     - Fixed price from the server (null if owner sets it first time)
     * @param isOwner      - Whether the current user is the post owner
     * @param alreadyClaimed - Passed through but unused here (button hidden upstream)
     */
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
        }
        else if (!mintIsOwner) {
            if (!mintOwnerWallet) throw new Error("Owner wallet not found");

            // 95% → owner, 5% → platform
            const ixs = buildMintPaymentInstructions(address, mintOwnerWallet, price);
            paymentSignature = await sendInstructions(ixs);

            if (!paymentSignature) throw new Error("Payment was not confirmed");
        }

        await mintNFT(address, postId, price, paymentSignature);
    };

    return (
        <View style={styles.container}>
            <PostPopup
                visible={popupVisible}
                postId={selectedPostId}
                onClose={() => setPopupVisible(false)}
                currentUserId={userID ?? undefined}
                onOpenComments={(id) => setCommentsPostId(id)}
                onOpenMint={handleOpenMint}
            />

            {commentsPostId !== null && (
                <PopupModal
                    post_id={commentsPostId}
                    onClose={() => setCommentsPostId(null)}
                    isCommentsEnabled={true}
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
            />

            {loading ? (
                <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={posts}
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
                        const isApproved = item.moderation_status === "approved";
                        const isPending = item.moderation_status === "pending" && item.user_id === userID;

                        return (
                            <TouchableOpacity
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                                style={styles.postContainer}
                                onPress={() => isApproved ? handlePostPress(item) : null}
                                activeOpacity={isApproved ? 0.75 : 1}
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

                                {isPending && (
                                    <BlurView
                                        style={styles.moderationStatus}
                                        blurType="dark"
                                        blurAmount={10}
                                    >
                                        <View style={styles.moderationContent}>
                                            <Timer size={28} color="white" style={{ alignSelf: "center" }} />
                                            <Text style={styles.moderationText}>Post on Moderation</Text>
                                        </View>
                                    </BlurView>
                                )}

                                {hasMedia && isApproved && (
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconRow}>
                                            {isMediaVideo
                                                ? <Video size={16} color="white" />
                                                : <Image size={16} color="white" />
                                            }
                                            {item.is_ai_generated && (
                                                <Sparkles size={16} color="#05f0d8" />
                                            )}
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    onEndReached={() => fetchPosts(true)}
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
    moderationStatus: {
        position: "absolute",
        width: "100%",
        height: "100%",
        zIndex: 9999,
        borderRadius: 10,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    moderationContent: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    moderationText: {
        color: "white",
        fontSize: 11,
        textAlign: "center",
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        lineHeight: 14,
        letterSpacing: 0.5,
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
});

export default PostGallery;