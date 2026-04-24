import React, { useState, useRef, useEffect, useCallback } from "react";
import {
    View,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Text,
    Animated,
    Easing,
} from "react-native";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getMenuPosts from "@/src/api/menu.posts";
import { useFocusEffect } from 'expo-router';
import { BlurView } from "@react-native-community/blur";
import FastImage from 'react-native-fast-image';
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
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3;

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
}

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
    const [mintMintedCount, setMintMintedCount] = useState<number>(0);
    const { sendInstructions } = useTransaction();
    const { address } = useWalletAddress();

    const POSTS_PER_PAGE = 9;

    const getId = async () => {
        const storedId = await storage.getItem("id");
        const parsedId = Number(storedId);
        setUserID(parsedId);
        return parsedId;
    };

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

    const handlePostPress = (item: Post) => {
        if (item.moderation_status !== "approved") return;
        setSelectedPostId(item.post_id);
        setPopupVisible(true);
    };

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
    };

    const hasBadges = (item: Post) =>
        item.is_nft || item.is_ai_generated || item.is_luma_event;

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
                page={`user-profile?id=${id}`}
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
                                activeOpacity={isApproved ? 0.8 : 1}
                            >
                                {hasMedia ? (
                                    isMediaVideo ? (
                                        <View style={styles.videoContainer}>
                                            {item.is_luma_event && (
                                                <>
                                                    <FastImage source={{ uri: getPreviewUrl(mediaUrl!, item) }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
                                                    <BlurView blurType="dark" blurAmount={20} style={StyleSheet.absoluteFill} />
                                                </>
                                            )}
                                            <FastImage
                                                source={{ uri: getPreviewUrl(mediaUrl!, item) }}
                                                style={styles.media}
                                                resizeMode={item.is_luma_event ? FastImage.resizeMode.contain : FastImage.resizeMode.cover}
                                            />
                                        </View>
                                    ) : (
                                        <View style={styles.videoContainer}>
                                            {item.is_luma_event && (
                                                <>
                                                    <FastImage source={{ uri: mediaUrl! }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
                                                    <BlurView blurType="dark" blurAmount={20} style={StyleSheet.absoluteFill} />
                                                </>
                                            )}
                                            <FastImage
                                                source={{ uri: mediaUrl! }}
                                                style={styles.media}
                                                resizeMode={item.is_luma_event ? FastImage.resizeMode.contain : FastImage.resizeMode.cover}
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
                                        <Text style={styles.placeholderText}>Немає медіа</Text>
                                    </View>
                                )}

                                {hasMedia && isApproved && (isMediaVideo || hasBadges(item)) && (
                                    <LinearGradient
                                        colors={["transparent", "rgba(0,0,0,0.55)"]}
                                        style={styles.bottomGradient}
                                        pointerEvents="none"
                                    />
                                )}

                                {isPending && (
                                    <View style={styles.moderationOverlay}>
                                        <BlurView
                                            style={StyleSheet.absoluteFill}
                                            blurType="dark"
                                            blurAmount={14}
                                        />
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
                                            <View style={styles.badge}>
                                                <Video size={11} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                                            </View>
                                        )}
                                        {item.is_nft && (
                                            <View style={[styles.badge, styles.badgeNft]}>
                                                <Gem size={11} color="#c4b5fd" strokeWidth={2} />
                                            </View>
                                        )}
                                        {item.is_ai_generated && (
                                            <View style={[styles.badge, styles.badgeAi]}>
                                                <Sparkles size={11} color="#05f0d8" strokeWidth={2} />
                                            </View>
                                        )}
                                        {item.is_luma_event && (
                                            <View style={[styles.badge, styles.badgeEvent]}>
                                                <Calendar size={11} color="#d8b4fe" strokeWidth={2} />
                                            </View>
                                        )}
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