import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ImageOff } from "lucide-react-native";
import { OwnedAsset } from "./useOwnedAssets";

const PILL_COLORS: Record<string, string> = {
    OG: "#f0abfc",
    POAP: "#6ee7b7",
    Post: "#d8b4fe",
};

interface CollectibleTileProps {
    asset: OwnedAsset;
    /** Computed square side in px — no fixed pixel widths inside the tile. */
    size: number;
    onPress: (asset: OwnedAsset) => void;
}

/**
 * Square collectible thumbnail shared by every 3-column grid (wallet
 * Collectibles tab and profile reuse). The name sits in a gradient overlay
 * at the bottom so the tile itself stays a perfect square.
 */
const CollectibleTile = React.memo(({ asset, size, onPress }: CollectibleTileProps) => (
    <TouchableOpacity
        style={[styles.tile, { width: size, height: size }]}
        activeOpacity={0.8}
        onPress={() => onPress(asset)}
    >
        {asset.image ? (
            <ExpoImage
                source={{ uri: asset.image }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={120}
            />
        ) : (
            <View style={styles.placeholder}>
                <ImageOff size={22} color="#666" />
            </View>
        )}

        {asset.pill && (
            <View style={[styles.pill, { borderColor: PILL_COLORS[asset.pill] ?? "#d8b4fe" }]}>
                <Text style={[styles.pillText, { color: PILL_COLORS[asset.pill] ?? "#d8b4fe" }]}>
                    {asset.pill}
                </Text>
            </View>
        )}

        <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.72)"]}
            style={styles.nameOverlay}
        >
            <Text style={styles.name} numberOfLines={1}>
                {asset.name}
            </Text>
        </LinearGradient>
    </TouchableOpacity>
));

CollectibleTile.displayName = "CollectibleTile";

const styles = StyleSheet.create({
    tile: {
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
    },
    placeholder: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#222",
        justifyContent: "center",
        alignItems: "center",
    },
    pill: {
        position: "absolute",
        top: 6,
        left: 6,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: "rgba(0,0,0,0.6)",
    },
    pillText: {
        fontSize: 9,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
    nameOverlay: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 8,
        paddingTop: 18,
        paddingBottom: 6,
        justifyContent: "flex-end",
    },
    name: {
        color: "rgba(255,255,255,0.92)",
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
});

export default CollectibleTile;
