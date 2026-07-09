import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Animated,
    ScrollView,
    Linking,
    Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import GlassBadge from "@/components/Shared/GlassBadge";
import GlassPill from "@/components/Shared/GlassPill";
import GlassModalCard from "@/components/Shared/GlassModalCard";
import {
    Sparkles,
    MapPin,
    Calendar,
    Heart,
    X,
    Image as ImageIcon,
    Copy,
    Check,
    ExternalLink,
    Gem,
    Hash,
    Wallet,
    Clock,
    Layers,
} from "lucide-react-native";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";
import VerifyBadge from "../VerifyBadge";
import * as Clipboard from "expo-clipboard";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_HORIZONTAL_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2;
const IMAGE_HEIGHT = CARD_WIDTH;

const OPEN_TRANSLATE_Y = 60;
const CLOSE_TRANSLATE_Y = 40;
const OPEN_SCALE_FROM = 0.88;
const CLOSE_SCALE_TO = 0.92;

const SOLSCAN_BASE = "https://solscan.io";

export interface CollectionItemData {
    user_id: number;
    post_id: number;
    about: string;
    count_likes: number;
    media: { id: number; media_url: string; media_preview: string | null }[] | null;
    create_at: string;
    is_ai_generated: boolean;
    location: string | null;
    moderation_status: string;
    is_comments_enabled: boolean;
    is_nft: boolean;
    edition: number;
    price: string;
    asset_id: string;
    signature: string | null;
    minted_at: string;
    total_supply: number;
    minted_count: number;
    creator_username: string;
    creator_avatar: string | null;
    creator_official: boolean;
    is_luma_event?: boolean;
}

interface CollectiblesModalProps {
    visible: boolean;
    item: CollectionItemData | null;
    onClose: () => void;
}

const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const truncate = (str: string, len: number = 16): string =>
    str.length > len ? `${str.slice(0, len / 2)}…${str.slice(-len / 2)}` : str;

/**
 * Row component for displaying a label + value pair with optional copy button
 */
const InfoRow = ({
    icon,
    label,
    value,
    copiable,
    linkUrl,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    copiable?: boolean;
    linkUrl?: string;
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [value]);

    return (
        <View style={s.infoRow}>
            <View style={s.infoLabelRow}>
                {icon}
                <Text style={s.infoLabel}>{label}</Text>
            </View>
            <View style={s.infoValueRow}>
                <Text style={s.infoValue} numberOfLines={1}>
                    {copiable ? truncate(value) : value}
                </Text>
                {copiable && (
                    <TouchableOpacity
                        onPress={handleCopy}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        {copied ? (
                            <Check size={14} color="#4ade80" />
                        ) : (
                            <Copy size={14} color="rgba(255,255,255,0.4)" />
                        )}
                    </TouchableOpacity>
                )}
                {linkUrl && (
                    <TouchableOpacity
                        onPress={() => Linking.openURL(linkUrl)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <ExternalLink size={14} color="#a78bfa" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const CollectiblesModal: React.FC<CollectiblesModalProps> = ({
    visible,
    item,
    onClose,
}) => {
    const [modalVisible, setModalVisible] = useState(false);
    const [eventImageHeight, setEventImageHeight] = useState<number | null>(null);

    const translateY = useRef(new Animated.Value(OPEN_TRANSLATE_Y)).current;
    const scale = useRef(new Animated.Value(OPEN_SCALE_FROM)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const rAFRef = useRef<number | null>(null);

    const runOpenAnimation = () => {
        translateY.setValue(OPEN_TRANSLATE_Y);
        scale.setValue(OPEN_SCALE_FROM);
        cardOpacity.setValue(0);
        backdropOpacity.setValue(0);
        const animations = [
            Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, tension: 70, friction: 12, useNativeDriver: true }),
        ];
        if (Platform.OS !== 'ios') {
            animations.push(Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }));
        } else {
            cardOpacity.setValue(1);
        }
        Animated.parallel(animations).start();
    };

    const runCloseAnimation = (onDone: () => void) => {
        const animations = [
            Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: CLOSE_TRANSLATE_Y, duration: 200, useNativeDriver: true }),
            Animated.timing(scale, { toValue: CLOSE_SCALE_TO, duration: 200, useNativeDriver: true }),
        ];
        if (Platform.OS !== 'ios') {
            animations.push(Animated.timing(cardOpacity, { toValue: 0, duration: 180, useNativeDriver: true }));
        }
        Animated.parallel(animations).start(onDone);
    };

    useEffect(() => {
        if (visible && item) {
            setModalVisible(true);
            setEventImageHeight(null);
            rAFRef.current = requestAnimationFrame(() => {
                rAFRef.current = requestAnimationFrame(runOpenAnimation);
            });
        } else if (modalVisible) {
            runCloseAnimation(() => setModalVisible(false));
        }
    }, [visible]);

    useEffect(() => {
        return () => {
            if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
        };
    }, []);

    const handleClose = () => {
        runCloseAnimation(() => {
            setModalVisible(false);
            onClose();
        });
    };

    const mediaUrl = item?.media?.[0]?.media_url ?? null;

    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            statusBarTranslucent={false}
            onRequestClose={handleClose}
        >
            <Animated.View style={[s.backdrop, Platform.OS === 'ios' && s.backdropIOS, { opacity: backdropOpacity }]} pointerEvents="auto">
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleClose} activeOpacity={1} />
            </Animated.View>

            <Animated.View
                style={[
                    s.cardWrapper,
                    Platform.OS === 'ios'
                        ? { transform: [{ translateY }, { scale }] }
                        : { opacity: cardOpacity, transform: [{ translateY }, { scale }] },
                ]}
                pointerEvents="box-none"
            >
                <View style={s.glowWrapper}>
                    <GlassModalCard style={s.card}>

                        {/* Header */}
                        <View style={s.postHeader}>
                            <View style={s.userInfo}>
                                <AvatarWithFrame
                                    avatarUrl={item?.creator_avatar ?? null}
                                    size={38}
                                    isOg={false}
                                    ogEdition={null}
                                    invitedCount={0}
                                />
                                <View style={s.usernameRow}>
                                    <Text style={s.username} numberOfLines={1}>
                                        {item?.creator_username ?? ""}
                                    </Text>
                                    {item?.creator_official && (
                                        <View style={s.badgeWrapper}>
                                            <VerifyBadge
                                                isLooped={false}
                                                isVisible={true}
                                                haveModal={false}
                                                isStatic={true}
                                                size={15}
                                            />
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View style={s.headerActions}>
                                {/* Edition pill */}
                                <GlassPill
                                    style={s.editionPill}
                                    colorScheme="dark"
                                    tintColor="rgba(168,85,247,0.15)"
                                    fallbackBackgroundColor="rgba(168,85,247,0.15)"
                                    fallbackBorderColor="rgba(168,85,247,0.3)"
                                >
                                    <Text style={s.editionPillText}>
                                        #{item?.edition ?? 0} of {item?.total_supply ?? 50}
                                    </Text>
                                </GlassPill>

                                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                                    <GlassPill
                                        style={s.closeBtn}
                                        colorScheme="dark"
                                        fallbackBackgroundColor="rgba(255,255,255,0.08)"
                                        fallbackBorderColor="rgba(255,255,255,0.12)"
                                        isInteractive
                                    >
                                        <X size={15} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
                                    </GlassPill>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {item ? (
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                                {/* Image */}
                                {mediaUrl ? (
                                    <View style={[
                                        s.imageWrapper,
                                        eventImageHeight ? { height: eventImageHeight } : {},
                                        item.is_luma_event ? { borderTopLeftRadius: 16, borderTopRightRadius: 16 } : {},
                                    ]}>
                                        <ExpoImage
                                            source={{ uri: mediaUrl }}
                                            style={s.image}
                                            contentFit={
                                                item.is_luma_event
                                                    ? "contain"
                                                    : "cover"
                                            }
                                            onLoad={(evt) => {
                                                if (item.is_luma_event) {
                                                    const width = evt.source?.width || (evt as any).nativeEvent?.width;
                                                    const height = evt.source?.height || (evt as any).nativeEvent?.height;
                                                    if (width && width > 0 && height) {
                                                        setEventImageHeight((CARD_WIDTH / width) * height);
                                                    }
                                                }
                                            }}
                                        />
                                        {/* Badges */}
                                        <View style={s.imageBadges}>
                                            {item.is_ai_generated && (
                                                <GlassBadge variant="overlay">
                                                    <Sparkles size={11} color="#05f0d8" />
                                                    <Text style={s.badgeText}>AI Generated</Text>
                                                </GlassBadge>
                                            )}
                                            {item.is_nft && (
                                                <GlassBadge variant="overlay-nft">
                                                    <Gem size={11} color="#d8b4fe" />
                                                    <Text style={s.nftBadgeText}>
                                                        {item.minted_count}/{item.total_supply} minted
                                                    </Text>
                                                </GlassBadge>
                                            )}
                                            {item.location && (
                                                <GlassBadge variant="overlay">
                                                    <MapPin size={11} color="#fff" />
                                                    <Text style={s.badgeText}>{item.location}</Text>
                                                </GlassBadge>
                                            )}
                                        </View>
                                    </View>
                                ) : (
                                    <View style={s.noMediaContainer}>
                                        <ImageIcon size={44} color="#555" />
                                        <Text style={s.noMediaText}>No media</Text>
                                    </View>
                                )}

                                <View style={s.content}>
                                    {/* About */}
                                    {!!item.about && (
                                        <Text style={s.aboutText}>{item.about}</Text>
                                    )}

                                    {/* Divider */}
                                    <View style={s.divider} />

                                    {/* Section title */}
                                    <View style={s.sectionTitleRow}>
                                        <Gem size={14} color="#a78bfa" />
                                        <Text style={s.sectionTitle}>Collectible Details</Text>
                                    </View>

                                    {/* Info rows */}
                                    <View style={s.infoBlock}>
                                        <InfoRow
                                            icon={<Hash size={13} color="#a78bfa" />}
                                            label="Edition"
                                            value={`#${item.edition} of ${item.total_supply}`}
                                        />
                                        <InfoRow
                                            icon={<Wallet size={13} color="#a78bfa" />}
                                            label="Price"
                                            value={`${item.price} SOL`}
                                        />
                                        <InfoRow
                                            icon={<Clock size={13} color="#a78bfa" />}
                                            label="Minted"
                                            value={formatDate(item.minted_at)}
                                        />
                                        <InfoRow
                                            icon={<Layers size={13} color="#a78bfa" />}
                                            label="Supply"
                                            value={`${item.minted_count} / ${item.total_supply} claimed`}
                                        />
                                    </View>

                                    {/* Divider */}
                                    <View style={s.divider} />

                                    {/* On-chain section */}
                                    <View style={s.sectionTitleRow}>
                                        <ExternalLink size={14} color="#a78bfa" />
                                        <Text style={s.sectionTitle}>On-Chain</Text>
                                    </View>

                                    <View style={s.infoBlock}>
                                        <InfoRow
                                            icon={<Gem size={13} color="#a78bfa" />}
                                            label="Asset ID"
                                            value={item.asset_id}
                                            copiable
                                            linkUrl={`${SOLSCAN_BASE}/token/${item.asset_id}`}
                                        />
                                        {item.signature && (
                                            <InfoRow
                                                icon={<Hash size={13} color="#a78bfa" />}
                                                label="Signature"
                                                value={item.signature}
                                                copiable
                                                linkUrl={`${SOLSCAN_BASE}/tx/${item.signature}`}
                                            />
                                        )}
                                    </View>

                                    {/* Likes */}
                                    <View style={s.divider} />
                                    <View style={s.footerRow}>
                                        <Heart size={16} color="#A855F7" fill="#A855F7" />
                                        <Text style={s.footerText}>
                                            {item.count_likes} {item.count_likes === 1 ? "like" : "likes"}
                                        </Text>
                                        <View style={{ flex: 1 }} />
                                        <Calendar size={13} color="#666" />
                                        <Text style={s.footerDate}>
                                            {new Date(item.create_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}
                                        </Text>
                                    </View>
                                </View>
                            </ScrollView>
                        ) : null}
                    </GlassModalCard>
                </View>
            </Animated.View>
        </Modal>
    );
};

const s = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.55)",
    },
    backdropIOS: {
        backgroundColor: "rgba(0,0,0,0.28)",
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
        shadowColor: "#a855f7",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 20,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: "transparent",
        borderRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.88,
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
    usernameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    username: {
        color: "#fff",
        fontSize: 15,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        textAlignVertical: "center",
        ...(Platform.OS === 'ios' ? {
            textShadowColor: 'rgba(0,0,0,0.45)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
        } : {}),
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
    editionPill: {
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        overflow: 'hidden',
    },
    editionPillText: {
        color: "#d8b4fe",
        fontSize: 11,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
        overflow: 'hidden',
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
        backgroundColor: "rgba(0,0,0,0.85)",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
    badgeText: {
        color: "#fff",
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
    nftBadge: {
        borderColor: "rgba(168,85,247,0.6)",
        backgroundColor: "rgba(30, 0, 50, 0.85)",
    },
    nftBadgeText: {
        color: "#d8b4fe",
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 32,
    },
    aboutText: {
        color: "#ddd",
        fontSize: 14,
        lineHeight: 21,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
        letterSpacing: 0.1,
        marginBottom: 4,
        ...(Platform.OS === 'ios' ? {
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
        } : {}),
    },
    divider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.07)",
        marginVertical: 14,
    },
    sectionTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 12,
    },
    sectionTitle: {
        color: "#a78bfa",
        fontSize: 13,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    infoBlock: {
        gap: 10,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    infoLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    infoLabel: {
        color: "rgba(255,255,255,0.45)",
        fontSize: 12,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
    infoValueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 1,
    },
    infoValue: {
        color: "#fff",
        fontSize: 12,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        maxWidth: 160,
    },
    footerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    footerText: {
        color: "#A855F7",
        fontSize: 13,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    footerDate: {
        color: "#666",
        fontSize: 12,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
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
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
});

export default CollectiblesModal;
