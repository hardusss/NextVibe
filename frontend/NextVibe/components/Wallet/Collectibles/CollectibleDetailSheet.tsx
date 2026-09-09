import React, { useEffect, useRef, useState } from "react";
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
import GlassModalCard from "@/components/Shared/GlassModalCard";
import GlassPill from "@/components/Shared/GlassPill";
import { X, Gem, Hash, Layers, ExternalLink, Send, Info, Image as ImageIcon } from "lucide-react-native";
import { InfoRow } from "@/components/ProfilePage/CollectiblesModal";
import { FEATURE_CNFT_SEND } from "@/constants/FeatureFlags";
import { OwnedAsset } from "./useOwnedAssets";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 32;
const IMAGE_HEIGHT = CARD_WIDTH;

const SOLSCAN_BASE = "https://solscan.io";

interface CollectibleDetailSheetProps {
    visible: boolean;
    asset: OwnedAsset | null;
    onClose: () => void;
}

/**
 * Parses the edition number from a NextVibe cNFT name
 * (e.g. "Post by @nxv #5" or "NextVibe OG #3/25").
 */
function parseEdition(name: string): string | null {
    const match = name.match(/#(\d+)/);
    return match ? `#${match[1]}` : null;
}

/**
 * Detail sheet for a single owned collectible, shared between the wallet
 * Collectibles tab and history deep-links. The Send flow is staged behind
 * FEATURE_CNFT_SEND and ships as a disabled "coming soon" button.
 */
const CollectibleDetailSheet: React.FC<CollectibleDetailSheetProps> = ({ visible, asset, onClose }) => {
    const [modalVisible, setModalVisible] = useState(false);
    const translateY = useRef(new Animated.Value(50)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible && asset) {
            setModalVisible(true);
            translateY.setValue(50);
            backdropOpacity.setValue(0);
            Animated.parallel([
                Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
            ]).start();
        } else if (modalVisible) {
            Animated.parallel([
                Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(translateY, { toValue: 40, duration: 200, useNativeDriver: true }),
            ]).start(() => setModalVisible(false));
        }
    }, [visible]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 40, duration: 200, useNativeDriver: true }),
        ]).start(() => {
            setModalVisible(false);
            onClose();
        });
    };

    const edition = asset ? parseEdition(asset.name) : null;

    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            statusBarTranslucent={false}
            onRequestClose={handleClose}
        >
            <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} pointerEvents="auto">
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleClose} activeOpacity={1} />
            </Animated.View>

            <Animated.View style={[s.cardWrapper, { transform: [{ translateY }] }]} pointerEvents="box-none">
                <GlassModalCard style={s.card}>
                    {/* Header */}
                    <View style={s.header}>
                        <View style={s.titleRow}>
                            <Gem size={15} color="#a78bfa" />
                            <Text style={s.headerTitle} numberOfLines={1}>
                                {asset?.name ?? ""}
                            </Text>
                        </View>
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

                    {asset ? (
                        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                            {/* Image */}
                            {asset.image ? (
                                <ExpoImage source={{ uri: asset.image }} style={s.image} contentFit="cover" />
                            ) : (
                                <View style={s.noMedia}>
                                    <ImageIcon size={44} color="#555" />
                                </View>
                            )}

                            <View style={s.content}>
                                <View style={s.infoBlock}>
                                    {asset.collectionName && (
                                        <InfoRow
                                            icon={<Layers size={13} color="#a78bfa" />}
                                            label="Collection"
                                            value={asset.collectionName}
                                        />
                                    )}
                                    {edition && (
                                        <InfoRow
                                            icon={<Hash size={13} color="#a78bfa" />}
                                            label="Edition"
                                            value={edition}
                                        />
                                    )}
                                    <InfoRow
                                        icon={<Gem size={13} color="#a78bfa" />}
                                        label="Asset ID"
                                        value={asset.id}
                                        copiable
                                        linkUrl={`${SOLSCAN_BASE}/token/${asset.id}`}
                                    />
                                </View>

                                {/* Solscan */}
                                <TouchableOpacity
                                    style={s.solscanBtn}
                                    activeOpacity={0.8}
                                    onPress={() => Linking.openURL(`${SOLSCAN_BASE}/token/${asset.id}`)}
                                >
                                    <ExternalLink size={14} color="#a78bfa" />
                                    <Text style={s.solscanText}>View on Solscan</Text>
                                </TouchableOpacity>

                                {/* Send — staged behind FEATURE_CNFT_SEND */}
                                <TouchableOpacity
                                    style={[s.sendBtn, !FEATURE_CNFT_SEND && s.sendBtnDisabled]}
                                    activeOpacity={FEATURE_CNFT_SEND ? 0.8 : 1}
                                    disabled={!FEATURE_CNFT_SEND}
                                >
                                    <Send size={14} color={FEATURE_CNFT_SEND ? "#fff" : "rgba(255,255,255,0.35)"} />
                                    <Text style={[s.sendText, !FEATURE_CNFT_SEND && s.sendTextDisabled]}>
                                        {FEATURE_CNFT_SEND ? "Send" : "Send — coming soon"}
                                    </Text>
                                </TouchableOpacity>

                                {/* Verification note */}
                                <View style={s.noteRow}>
                                    <Info size={12} color="rgba(255,255,255,0.35)" />
                                    <Text style={s.noteText}>
                                        Not seeing it in Phantom/Solflare? It may be under Unverified until the collection is approved.
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>
                    ) : null}
                </GlassModalCard>
            </Animated.View>
        </Modal>
    );
};

const s = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: Platform.OS === "ios" ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.55)",
    },
    cardWrapper: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: "transparent",
        borderRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.88,
        overflow: "hidden",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        flex: 1,
    },
    headerTitle: {
        color: "#fff",
        fontSize: 15,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
        flexShrink: 1,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
    },
    image: {
        width: "100%",
        height: IMAGE_HEIGHT,
        backgroundColor: "#111",
    },
    noMedia: {
        width: "100%",
        height: 180,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#161616",
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 28,
    },
    infoBlock: {
        gap: 10,
        marginBottom: 16,
    },
    solscanBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(167,139,250,0.35)",
        backgroundColor: "rgba(167,139,250,0.08)",
        marginBottom: 10,
    },
    solscanText: {
        color: "#a78bfa",
        fontSize: 13,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    sendBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: 14,
        backgroundColor: "#8B5CF6",
        marginBottom: 14,
    },
    sendBtnDisabled: {
        backgroundColor: "rgba(139,92,246,0.18)",
    },
    sendText: {
        color: "#fff",
        fontSize: 13,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    sendTextDisabled: {
        color: "rgba(255,255,255,0.35)",
    },
    noteRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        paddingHorizontal: 2,
    },
    noteText: {
        flex: 1,
        color: "rgba(255,255,255,0.35)",
        fontSize: 11,
        lineHeight: 15,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
});

export default CollectibleDetailSheet;
