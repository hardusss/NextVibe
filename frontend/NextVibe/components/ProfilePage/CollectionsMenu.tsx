import {
    View,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Text,
    ActivityIndicator as RNActivityIndicator,
    Vibration,
} from "react-native";
import { ActivityIndicator } from "../CustomActivityIndicator";
import getCollectionsMenu from "@/src/api/get.collections.menu";
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import FastImage from 'react-native-fast-image';
import { BlurView } from "@react-native-community/blur";
import { Image, Video, Sparkles, Gem, Crown, CheckCircle2, UserCircle2, Calendar } from "lucide-react-native";
import { useColorScheme } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import setAvatar from "@/src/api/set.avatar";

const screenWidth = Dimensions.get("window").width;
const padding = 26;
const imageSize = (screenWidth - padding * 2) / 3;

interface PostMedia {
    media_url: string;
    media_preview: string | null;
}

interface CollectionItem {
    user_id: number;
    post_id: number;
    media: PostMedia[] | null;
    is_nft: boolean;
    moderation_status: string;
    edition: number;
    price: string;
    asset_id: string;
    minted_at: string;
    is_luma_event?: boolean;
}

interface OgAvatar {
    isOG: boolean;
    edition: number;
    image_url: string;
    minted_at: string;
}

type MediaCheck =
    | { storage: string; is_video: true }
    | false;

type SetAvatarState = 'idle' | 'loading' | 'done';

interface CollectionsGalleryProps {
    id: number;
    /** Pass false when rendering another user's profile to hide the "Set as Avatar" button */
    isOwnProfile?: boolean;
}

interface OgAvatarCardProps {
    og: OgAvatar;
    isDark: boolean;
    isOwnProfile: boolean;
    onSetAvatar: () => Promise<void>;
}

/**
 * Renders the OG cNFT card pinned above the collection grid.
 * Only shown when the profile owner has minted an OG Avatar cNFT.
 *
 * Set as Avatar button states:
 * - idle    : pressable, shows UserCircle2 icon
 * - loading : request in flight, shows spinner, button disabled
 * - done    : avatar was set, shows CheckCircle2, button locked
 */
function OgAvatarCard({ og, isDark, isOwnProfile, onSetAvatar }: OgAvatarCardProps) {
    const accentColor = isDark ? '#d8b4fe' : '#7c3aed';
    const borderColor = isDark ? 'rgba(196,167,255,0.35)' : 'rgba(109,40,217,0.25)';
    const cardBg = isDark ? 'rgba(167,139,250,0.08)' : 'rgba(109,40,217,0.05)';
    const mutedColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    const mainColor = isDark ? '#ffffff' : '#1f2937';
    const btnBg = isDark ? 'rgba(167,139,250,0.12)' : 'rgba(109,40,217,0.07)';

    const [setAvatarState, setSetAvatarState] = useState<SetAvatarState>('idle');

    const isDisabled = setAvatarState !== 'idle';

    /**
     * Handles the "Set as Avatar" press.
     * Delegates the actual request to the onSetAvatar prop — caller owns the API logic.
     * On success transitions to 'done' (permanently locked for the session).
     * On error resets to 'idle' so the user can retry.
     */
    const handleSetAvatar = async () => {
        if (isDisabled) return;

        setSetAvatarState('loading');
        Vibration.vibrate(20);

        try {
            await onSetAvatar();
            setSetAvatarState('done');
            Vibration.vibrate([0, 40, 60, 80]);
        } catch {
            setSetAvatarState('idle');
        }
    };

    const formattedDate = new Date(og.minted_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    const doneBtnBorder = isDark ? 'rgba(52,211,153,0.4)' : 'rgba(16,185,129,0.3)';
    const doneBtnBg = isDark ? 'rgba(52,211,153,0.1)' : 'rgba(16,185,129,0.06)';
    const doneColor = isDark ? '#6ee7b7' : '#059669';

    const btnBorderColor = setAvatarState === 'done' ? doneBtnBorder : borderColor;
    const btnBackground = setAvatarState === 'done' ? doneBtnBg : btnBg;
    const btnTextColor = setAvatarState === 'done' ? doneColor : accentColor;

    return (
        <View style={[styles.ogCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.ogImageWrap}>
                <FastImage
                    source={{ uri: og.image_url }}
                    style={styles.ogImage}
                    resizeMode={FastImage.resizeMode.cover}
                />
                <LinearGradient
                    colors={['#7c3aed', '#a855f7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ogEditionBadge}
                >
                    <Crown size={10} color="#fff" strokeWidth={2} />
                    <Text style={styles.ogEditionText}>#{og.edition}</Text>
                </LinearGradient>
            </View>

            <View style={styles.ogInfo}>
                <View style={styles.ogTitleRow}>
                    <Text style={[styles.ogTitle, { color: mainColor }]}>OG cNFT</Text>
                    <View style={[styles.ogVerifiedPill, { borderColor, backgroundColor: cardBg }]}>
                        <CheckCircle2 size={11} color={accentColor} strokeWidth={2} />
                        <Text style={[styles.ogVerifiedText, { color: accentColor }]}>Verified OG</Text>
                    </View>
                </View>

                <Text style={[styles.ogSupplyText, { color: accentColor }]}>
                    Edition {og.edition} / 25
                </Text>

                <Text style={[styles.ogMintedText, { color: mutedColor }]}>
                    Minted {formattedDate}
                </Text>

                <Text style={[styles.ogDesc, { color: mutedColor }]}>
                    Max supply cNFT · Bubblegum protocol
                </Text>

                {isOwnProfile && (
                    <TouchableOpacity
                        style={[
                            styles.setAvatarBtn,
                            {
                                backgroundColor: btnBackground,
                                borderColor: btnBorderColor,
                                opacity: isDisabled && setAvatarState !== 'done' ? 0.7 : 1,
                            },
                        ]}
                        onPress={handleSetAvatar}
                        activeOpacity={isDisabled ? 1 : 0.75}
                        disabled={isDisabled}
                    >
                        {setAvatarState === 'loading' && (
                            <>
                                <RNActivityIndicator size={12} color={accentColor} />
                                <Text style={[styles.setAvatarText, { color: accentColor }]}>
                                    Setting...
                                </Text>
                            </>
                        )}
                        {setAvatarState === 'done' && (
                            <>
                                <CheckCircle2 size={12} color={doneColor} strokeWidth={2} />
                                <Text style={[styles.setAvatarText, { color: doneColor }]}>
                                    Avatar Set!
                                </Text>
                            </>
                        )}
                        {setAvatarState === 'idle' && (
                            <>
                                <UserCircle2 size={12} color={accentColor} strokeWidth={1.8} />
                                <Text style={[styles.setAvatarText, { color: btnTextColor }]}>
                                    Set as Avatar
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const CollectionsGallery = ({ id, isOwnProfile = false }: CollectionsGalleryProps) => {
    const isDark = useColorScheme() === "dark";

    const [items, setItems] = useState<CollectionItem[]>([]);
    const [ogAvatar, setOgAvatar] = useState<OgAvatar | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [index, setIndex] = useState(0);

    const POSTS_PER_PAGE = 9;

    const fetchItems = async (shouldLoadMore = false) => {
        if (loadingMore || !hasMore) return;

        if (shouldLoadMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const response = await getCollectionsMenu(id, index, POSTS_PER_PAGE);
            const newItems = response.data;
            setHasMore(response.more_posts);

            // OG avatar is only present on the first page — avoid overwriting with null on subsequent pages
            if (!shouldLoadMore && response.og_avatar) {
                setOgAvatar(response.og_avatar);
            }

            setItems((prev) => {
                if (shouldLoadMore) {
                    const unique = new Map(prev.map(item => [item.post_id, item]));
                    newItems.forEach((item: any) => unique.set(item.post_id, item));
                    return Array.from(unique.values());
                } else {
                    return newItems;
                }
            });

            setIndex((prev) => shouldLoadMore ? prev + POSTS_PER_PAGE : POSTS_PER_PAGE);
        } catch (error) { }

        setLoading(false);
        setLoadingMore(false);
    };

    useFocusEffect(
        useCallback(() => {
            setItems([]);
            setOgAvatar(null);
            setIndex(0);
            setHasMore(true);
            fetchItems(false);
        }, [])
    );

    const handleSetOgAvatar = async () => {
        if (!ogAvatar) throw new Error("No OG avatar data");
        await setAvatar(ogAvatar.image_url);
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

    const accentColor = isDark ? '#d8b4fe' : '#7c3aed';

    return (
        <View style={styles.container}>
            {loading ? (
                <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.post_id?.toString() || Math.random().toString()}
                    numColumns={3}
                    nestedScrollEnabled={true}
                    scrollEnabled={false}
                    initialNumToRender={3}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                    ListHeaderComponent={
                        ogAvatar ? (
                            <OgAvatarCard
                                og={ogAvatar}
                                isDark={isDark}
                                isOwnProfile={isOwnProfile}
                                onSetAvatar={handleSetOgAvatar}
                            />
                        ) : null
                    }
                    renderItem={({ item }) => {
                        const hasMedia = item.media && Array.isArray(item.media) && item.media.length > 0 && item.media[0]?.media_url;
                        const isMediaVideo = hasMedia && item.media ? isVideo(item.media[0].media_url) : false;
                        const mediaUrl = hasMedia && item.media ? item.media[0].media_url : null;

                        return (
                            <TouchableOpacity
                                style={styles.postContainer}
                                activeOpacity={1}
                            >
                                {hasMedia ? (
                                    isMediaVideo ? (
                                        <View style={styles.videoContainer}>
                                            {item.is_luma_event && (
                                                <>
                                                    <FastImage source={{ uri: getPreviewUrl(mediaUrl!, item as any) }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
                                                    <BlurView blurType="dark" blurAmount={20} style={StyleSheet.absoluteFill} />
                                                </>
                                            )}
                                            <FastImage
                                                source={{ uri: getPreviewUrl(mediaUrl!, item as any) }}
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
                                        <Image size={40} color="#666" />
                                    </View>
                                )}

                                {hasMedia && (
                                    <View style={styles.iconContainer}>
                                        <View style={styles.iconRow}>
                                            {isMediaVideo
                                                ? <Video size={16} color="white" />
                                                : <Image size={16} color="white" />
                                            }
                                            {(item as any).is_ai_generated && (
                                                <Sparkles size={16} color="#05f0d8" />
                                            )}
                                            {item.is_luma_event && (
                                                <Calendar size={16} color="#d8b4fe" />
                                            )}
                                            {item.is_nft && (
                                                <Gem size={16} color="#a78bfa" />
                                            )}
                                        </View>
                                    </View>
                                )}

                                <View style={styles.editionBadge}>
                                    <Text style={[styles.editionText, { color: accentColor }]}>
                                        #{item.edition}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    onEndReached={() => fetchItems(true)}
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
    ogCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        marginHorizontal: 2,
        marginBottom: 16,
        padding: 14,
        borderRadius: 20,
        borderWidth: 1,
    },
    ogImageWrap: {
        position: "relative",
    },
    ogImage: {
        width: 80,
        height: 80,
        borderRadius: 16,
    },
    ogEditionBadge: {
        position: "absolute",
        bottom: -6,
        left: "50%",
        transform: [{ translateX: -22 }],
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
    },
    ogEditionText: {
        color: "#fff",
        fontFamily: "Dank Mono Bold",
        fontSize: 10,
        includeFontPadding: false,
    },
    ogInfo: {
        flex: 1,
        gap: 4,
    },
    ogTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
    },
    ogTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
    },
    ogVerifiedPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    ogVerifiedText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 10,
        includeFontPadding: false,
    },
    ogSupplyText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        includeFontPadding: false,
    },
    ogMintedText: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
    ogDesc: {
        fontFamily: "Dank Mono",
        fontSize: 10,
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
    setAvatarBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        marginTop: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
    },
    setAvatarText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        includeFontPadding: false,
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
    editionBadge: {
        position: "absolute",
        bottom: 5,
        left: 5,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    editionText: {
        fontSize: 10,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
});

export default CollectionsGallery;