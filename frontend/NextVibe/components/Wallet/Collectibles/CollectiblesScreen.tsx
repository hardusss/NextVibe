import React, { useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { GlassSurface } from "@/components/Shared/GlassSurface";
import { Gem, ImageOff } from "lucide-react-native";
import { OwnedAsset } from "./useOwnedAssets";

const screenWidth = Dimensions.get("window").width;
const GRID_PADDING = 16;
const CELL_GAP = 8;
const CELL_SIZE = (screenWidth - GRID_PADDING * 2 - CELL_GAP * 2) / 3;

interface CollectiblesScreenProps {
    isDarkMode: boolean;
    assets: OwnedAsset[];
    loading: boolean;
    error: string | null;
    onSelect: (asset: OwnedAsset) => void;
}

const PILL_COLORS: Record<string, string> = {
    OG: "#f0abfc",
    POAP: "#6ee7b7",
    Post: "#d8b4fe",
};

const CollectibleCell = React.memo(({ asset, nameColor, onSelect }: {
    asset: OwnedAsset;
    nameColor: string;
    onSelect: (a: OwnedAsset) => void;
}) => (
    <TouchableOpacity style={styles.cell} activeOpacity={0.8} onPress={() => onSelect(asset)}>
        {asset.image ? (
            <ExpoImage source={{ uri: asset.image }} style={styles.cellImage} contentFit="cover" />
        ) : (
            <View style={styles.cellPlaceholder}>
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
        <Text style={[styles.cellName, { color: nameColor }]} numberOfLines={1}>
            {asset.name}
        </Text>
    </TouchableOpacity>
));

CollectibleCell.displayName = "CollectibleCell";

/**
 * Collectibles panel for the wallet dashboard's Tokens | Collectibles
 * segmented view. Renders a 3-column grid — NextVibe-minted items first,
 * anything else under "Other". Scrolling is owned by the dashboard's
 * ScrollView, so rows are plain views rather than a nested list.
 */
function CollectiblesScreen({ isDarkMode, assets, loading, error, onSelect }: CollectiblesScreenProps) {
    const titleColor = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)";
    const mutedColor = isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.28)";
    const iconColor = isDarkMode ? "rgba(196,167,255,0.85)" : "rgba(109,40,217,0.75)";
    const sheetBg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    const border = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

    const nameColor = isDarkMode ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.7)";

    const { nextVibe, other } = useMemo(() => ({
        nextVibe: assets.filter(a => a.isNextVibe),
        other: assets.filter(a => !a.isNextVibe),
    }), [assets]);

    const renderGrid = (items: OwnedAsset[]) => (
        <View style={styles.grid}>
            {items.map(asset => (
                <CollectibleCell key={asset.id} asset={asset} nameColor={nameColor} onSelect={onSelect} />
            ))}
        </View>
    );

    return (
        <GlassSurface
            style={[
                styles.sheet,
                { backgroundColor: sheetBg, borderColor: border, flex: 1 },
            ]}
            glassEffectStyle="clear"
            colorScheme={isDarkMode ? "dark" : "light"}
            tintColor={isDarkMode ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.005)"}
        >
            <View style={styles.header}>
                <View style={[styles.iconWrap, {
                    backgroundColor: isDarkMode ? "rgba(196,167,255,0.1)" : "rgba(109,40,217,0.07)",
                }]}>
                    <Gem size={14} color={iconColor} strokeWidth={1.6} />
                </View>
                <Text style={[styles.title, { color: titleColor }]}>Collectibles</Text>
                {!loading && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{assets.length}</Text>
                    </View>
                )}
            </View>

            {loading && assets.length === 0 ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="small" color={isDarkMode ? "#A78BFA" : "#5856D6"} />
                </View>
            ) : error && assets.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={[styles.emptyText, { color: mutedColor }]}>{error}</Text>
                </View>
            ) : assets.length === 0 ? (
                <View style={styles.centered}>
                    <Gem size={24} color={mutedColor} strokeWidth={1.4} />
                    <Text style={[styles.emptyText, { color: mutedColor }]}>No collectibles yet</Text>
                </View>
            ) : (
                <View style={styles.body}>
                    {renderGrid(nextVibe)}
                    {other.length > 0 && (
                        <>
                            {nextVibe.length > 0 && (
                                <Text style={[styles.sectionLabel, { color: mutedColor }]}>Other</Text>
                            )}
                            {renderGrid(other)}
                        </>
                    )}
                </View>
            )}
        </GlassSurface>
    );
}

const styles = StyleSheet.create({
    sheet: {
        marginHorizontal: 0,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: 0,
        paddingBottom: 24,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 12,
    },
    iconWrap: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        letterSpacing: 0.3,
        includeFontPadding: false,
    },
    countBadge: {
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: "rgba(196,167,255,0.12)",
    },
    countText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        color: "rgba(196,167,255,0.85)",
        includeFontPadding: false,
    },
    body: {
        paddingHorizontal: GRID_PADDING,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: CELL_GAP,
    },
    cell: {
        width: CELL_SIZE,
    },
    cellImage: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 12,
        backgroundColor: "#1a1a1a",
    },
    cellPlaceholder: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 12,
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
    cellName: {
        marginTop: 5,
        fontSize: 11,
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
    sectionLabel: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        letterSpacing: 0.4,
        marginTop: 16,
        marginBottom: 8,
        includeFontPadding: false,
    },
    centered: {
        alignItems: "center",
        paddingVertical: 48,
        gap: 8,
    },
    emptyText: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        includeFontPadding: false,
    },
});

export default React.memo(CollectiblesScreen);
