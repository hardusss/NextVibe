import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ImageOff } from "lucide-react-native";

import EventCta from "@/components/Events/EventCta";
import CollectibleChainSection, { Row } from "@/components/Collectibles/CollectibleChainSection";
import { getCollectible, type Collectible, type CollectibleDetail } from "@/src/api/collectibles";
import { useSheetBackHandler } from "@/hooks/useSheetBackHandler";
import { useCollectibles } from "@/src/stores/collectiblesStore";
import { openMeetSheet } from "@/src/stores/meetSheetStore";
import { applyUpdate, cardSubtitle, cardTitle } from "@/src/utils/collectibles";
import { colors, radius, space, type as typeScale } from "@/src/theme/tokens";

export interface CollectibleDetailSheetRef {
    present: (item: Collectible) => void;
    dismiss: () => void;
}

interface Props {
    /** The owner's Claim / Try again; absent on someone else's profile. */
    onClaim?: (item: Collectible) => void;
}

/** Wallet traits are long and already shown in the chain section. */
const HIDDEN_TRAITS = new Set(["Participant A wallet", "Participant B wallet", "Recorded", "Claimed later"]);

/**
 * One collectible. The same layout on-chain or not; only the chain section
 * differs: asset id, mint date, "View on Solana" and the owner's wallet once
 * it's on Solana, "Recorded on NextVibe · <date>" and Claim before that.
 * Never an empty field or a made-up id.
 */
const CollectibleDetailSheet = forwardRef<CollectibleDetailSheetRef, Props>(({ onClaim }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === "dark";
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [base, setBase] = useState<Collectible | null>(null);
    const [detail, setDetail] = useState<CollectibleDetail | null>(null);
    const [open, setOpen] = useState(false);
    const update = useCollectibles((s) => (base ? s.updates[String(base.id)] : undefined));

    useImperativeHandle(ref, () => ({
        present: (item) => {
            setBase(item);
            setDetail(null);
            sheetRef.current?.present();
        },
        dismiss: () => sheetRef.current?.dismiss(),
    }));

    useEffect(() => {
        if (!base || typeof base.id !== "number") return;
        let alive = true;
        getCollectible(base.id).then((d) => { if (alive) setDetail(d); }).catch(() => { });
        return () => { alive = false; };
        // Refetch when it lands, so the mint date and wallet show
    }, [base?.id, update?.status === "minted"]);

    const close = useCallback(() => sheetRef.current?.dismiss(), []);
    useSheetBackHandler(open, close);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} pressBehavior="close" />
        ),
        [],
    );

    const merged = base ? applyUpdate({ ...base, ...(detail ?? {}) } as Collectible, update) : null;
    const item = merged;
    const main = isDark ? colors.text : "#111827";
    const muted = isDark ? colors.sub : "rgba(17,24,39,0.6)";
    const faint = isDark ? colors.muted : "rgba(17,24,39,0.45)";
    const line = isDark ? colors.border : "rgba(17,24,39,0.08)";
    const imageWidth = Math.min(260, windowWidth - 2 * space.xxl);

    const traits = (detail?.attributes ?? []).filter((t) => !HIDDEN_TRAITS.has(t.trait_type) && t.value !== "—");

    return (
        <BottomSheetModal
            ref={sheetRef}
            stackBehavior="push"
            enableDynamicSizing
            maxDynamicContentSize={windowHeight - insets.top - space.xl}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: isDark ? "#0A0410" : "#F5F3FF" }}
            handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
            onChange={(index) => setOpen(index >= 0)}
            onDismiss={() => { setOpen(false); setBase(null); setDetail(null); }}
        >
            <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
                {item && (
                    <>
                        <View style={[styles.image, { width: imageWidth, height: Math.round(imageWidth * 1.25), backgroundColor: isDark ? "#1a1024" : "#E9E4FB" }]}>
                            {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                            ) : (
                                <View style={styles.noImage}><ImageOff size={32} color={faint} /></View>
                            )}
                        </View>
                        <Text style={[styles.title, { color: main }]}>{cardTitle(item)}</Text>
                        <Text style={[styles.subtitle, { color: muted }]}>{cardSubtitle(item)}</Text>

                        {item.kind === "meet" && !!item.meet_slug && (
                            <View style={styles.cta}>
                                <EventCta label="Open Proof of Meet" variant="secondary" onPress={() => {
                                    close();
                                    openMeetSheet(item.meet_slug!, "history");
                                }} />
                            </View>
                        )}

                        <View style={[styles.section, { borderTopColor: line }]}>
                            <Text style={[styles.sectionTitle, { color: faint }]}>
                                {item.onchain ? "ON SOLANA" : "NOT ON SOLANA YET"}
                            </Text>
                            <CollectibleChainSection item={item} onClaim={onClaim} />
                        </View>

                        {traits.length > 0 && (
                            <View style={[styles.section, { borderTopColor: line }]}>
                                <Text style={[styles.sectionTitle, { color: faint }]}>DETAILS</Text>
                                {traits.map((t) => (
                                    <Row key={t.trait_type} label={t.trait_type} muted={muted} line={line}>
                                        <Text style={[styles.value, { color: main }]} numberOfLines={1}>{String(t.value)}</Text>
                                    </Row>
                                ))}
                            </View>
                        )}
                    </>
                )}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
});

CollectibleDetailSheet.displayName = "CollectibleDetailSheet";
export default CollectibleDetailSheet;

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        alignItems: "stretch",
    },
    image: {
        alignSelf: "center",
        borderRadius: radius.lg,
        overflow: "hidden",
        marginBottom: space.lg,
    },
    noImage: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.h2,
        textAlign: "center",
        includeFontPadding: false,
    },
    subtitle: {
        marginTop: space.xs,
        fontFamily: "Dank Mono",
        fontSize: typeScale.sub,
        textAlign: "center",
        includeFontPadding: false,
    },
    section: {
        marginTop: space.xl,
        paddingTop: space.lg,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: space.sm,
    },
    sectionTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        letterSpacing: 0.8,
        includeFontPadding: false,
    },
    value: {
        flexShrink: 1,
        fontFamily: "Dank Mono Bold",
        fontSize: typeScale.caption + 1,
        textAlign: "right",
        includeFontPadding: false,
    },
    cta: {
        marginTop: space.md,
    },
});
