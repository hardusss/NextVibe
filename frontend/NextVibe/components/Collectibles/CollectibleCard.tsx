import React, { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Image } from "expo-image";
import { ImageOff } from "lucide-react-native";

import type { Collectible } from "@/src/api/collectibles";
import { cardSubtitle, cardTitle, claimLabel, FAILED_TEXT, isPending, NOT_ON_SOLANA, showsClaim, statusOf } from "@/src/utils/collectibles";
import haptics from "@/src/utils/haptics";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

/** Card images are portrait (the Proof of Meet card is 4:5). */
export const CARD_IMAGE_ASPECT = 5 / 4;

interface Props {
    item: Collectible;
    width: number;
    onPress: (item: Collectible) => void;
    /** The owner's Claim / Try again; never passed for someone else's profile. */
    onClaim?: (item: Collectible) => void;
}

/**
 * One collectible, the same card on-chain or not: image, name, kind and
 * date. An item not on Solana yet adds only a neutral "Not on Solana yet"
 * chip and, for its owner, the Claim button ("Minting…" while it goes,
 * "Try again" after it failed).
 */
function CollectibleCard({ item, width, onPress, onClaim }: Props) {
    const isDark = useColorScheme() === "dark";
    const main = isDark ? colors.text : "#111827";
    const muted = isDark ? colors.muted : "rgba(17,24,39,0.5)";
    const status = statusOf(item);
    const pending = isPending(item);
    const failed = status === "failed";
    const claimable = !!onClaim && (showsClaim(item) || (pending && item.status !== undefined));
    const imageHeight = Math.round(width * CARD_IMAGE_ASPECT);

    const handleClaim = () => {
        if (!onClaim || pending) return;
        haptics.impact("light");
        onClaim(item);
    };

    return (
        <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.card,
                {
                    width,
                    backgroundColor: isDark ? colors.card : "#F5F3FF",
                    borderColor: isDark ? colors.border : "rgba(17,24,39,0.06)",
                    opacity: pressed ? 0.85 : 1,
                },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${cardTitle(item)}, ${cardSubtitle(item)}${item.onchain ? "" : `, ${NOT_ON_SOLANA}`}`}
            testID={`collectible-${item.id}`}
        >
            <View style={[styles.imageWrap, { height: imageHeight, backgroundColor: isDark ? "#1a1024" : "#E9E4FB" }]}>
                {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                ) : (
                    <View style={styles.noImage}>
                        <ImageOff size={28} color={muted} />
                    </View>
                )}
                {!item.onchain && (
                    <View style={styles.chip} testID="not-on-solana-chip">
                        <Text style={styles.chipText} numberOfLines={1}>{NOT_ON_SOLANA}</Text>
                    </View>
                )}
            </View>

            <View style={styles.body}>
                <Text style={[styles.title, { color: main }]} numberOfLines={2}>{cardTitle(item)}</Text>
                <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>{cardSubtitle(item)}</Text>

                {claimable && (
                    <>
                        {failed && (
                            <Text style={[styles.failed, { color: isDark ? colors.sub : "rgba(17,24,39,0.62)" }]} numberOfLines={2}>
                                {FAILED_TEXT}
                            </Text>
                        )}
                        <Pressable
                            onPress={handleClaim}
                            disabled={pending}
                            hitSlop={6}
                            style={({ pressed }) => [
                                styles.claim,
                                pending
                                    ? { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)" }
                                    : { backgroundColor: pressed ? colors.accentDeep : colors.accent },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={claimLabel(item)}
                            accessibilityState={{ disabled: pending, busy: pending }}
                            testID="claim-button"
                        >
                            {pending && <ActivityIndicator size="small" color={muted} style={styles.spinner} />}
                            <Text style={[styles.claimText, { color: pending ? muted : "#FFFFFF" }]}>{claimLabel(item)}</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </Pressable>
    );
}

export default memo(CollectibleCard);

const styles = StyleSheet.create({
    card: {
        borderRadius: radius.md,
        borderWidth: 1,
        overflow: "hidden",
    },
    imageWrap: {
        width: "100%",
        overflow: "hidden",
    },
    noImage: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    chip: {
        position: "absolute",
        top: space.sm,
        left: space.sm,
        maxWidth: "88%",
        paddingHorizontal: space.sm,
        paddingVertical: 3,
        borderRadius: radius.pill,
        // Opaque enough that a logo in the image's corner doesn't show through
        backgroundColor: "rgba(10,4,16,0.86)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.18)",
    },
    chipText: {
        color: "rgba(255,255,255,0.82)",
        fontFamily: "Dank Mono Bold",
        fontSize: 10,
        includeFontPadding: false,
    },
    body: {
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        paddingBottom: space.md,
        gap: 2,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.sub,
        lineHeight: 18,
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption - 1,
        includeFontPadding: false,
    },
    failed: {
        marginTop: space.xs,
        fontFamily: "Dank Mono",
        fontSize: 11,
        lineHeight: 14,
        includeFontPadding: false,
    },
    claim: {
        marginTop: space.sm,
        minHeight: 32,
        borderRadius: radius.sm,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.md,
    },
    spinner: {
        marginRight: 6,
        transform: [{ scale: 0.75 }],
    },
    claimText: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption,
        includeFontPadding: false,
    },
});
