import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Smartphone, Zap, ChevronRight, Calendar } from "lucide-react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { getActiveCheckins, ActiveEvent } from "@/src/api/active.checkin";

/**
 * Tap to Meet — one entry point for meeting people in person.
 * Checked in to one active event -> event networking screen.
 * Checked in to several -> chooser sheet.
 * Not at an event -> IRL mode (no event, no geofence).
 */
export function TapToMeetButton() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const chooserRef = useRef<BottomSheetModal>(null);
    const [busy, setBusy] = useState(false);
    const [choices, setChoices] = useState<ActiveEvent[]>([]);
    const styles = getStyles();

    const openForEvent = useCallback((eventId: number) => {
        chooserRef.current?.dismiss();
        router.push(`/event-nfc-share?eventId=${eventId}` as any);
    }, [router]);

    const handlePress = useCallback(async () => {
        if (busy) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setBusy(true);
        let events: ActiveEvent[] = [];
        try {
            events = await getActiveCheckins();
        } catch (e) {
            console.warn("[TapToMeet] active checkin fetch failed:", e);
        }
        setBusy(false);

        if (events.length === 1) {
            openForEvent(events[0].event_id);
        } else if (events.length > 1) {
            setChoices(events);
            chooserRef.current?.present();
        } else {
            router.push("/event-nfc-share?mode=irl" as any);
        }
    }, [busy, openForEvent, router]);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} pressBehavior="close" />
        ),
        []
    );

    const sheetBg = isDark ? "#12091f" : "#FFFFFF";
    const main = isDark ? "#FFFFFF" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const divider = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    return (
        <>
            <TouchableOpacity onPress={handlePress} disabled={busy}>
                <LinearGradient
                    style={styles.button}
                    colors={["#6A00F4", "#8100dd"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                >
                    <View style={styles.contentWrap}>
                        {busy ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>Tap to Meet</Text>
                                <View style={styles.iconPair}>
                                    <Smartphone color="white" size={15} />
                                    <Zap color="white" size={11} fill="white" style={styles.zap} />
                                </View>
                            </>
                        )}
                    </View>
                </LinearGradient>
            </TouchableOpacity>

            <BottomSheetModal
                ref={chooserRef}
                index={0}
                enableDynamicSizing
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: sheetBg }}
                handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
            >
                <BottomSheetView style={styles.sheetBody}>
                    <Text style={[styles.sheetTitle, { color: main }]}>Tap to Meet</Text>
                    <Text style={[styles.sheetSub, { color: muted }]}>
                        You're checked in to a few events — pick where you're meeting.
                    </Text>
                    {choices.map((ev) => (
                        <TouchableOpacity
                            key={ev.event_id}
                            activeOpacity={0.75}
                            style={[styles.eventRow, { borderColor: divider }]}
                            onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                openForEvent(ev.event_id);
                            }}
                        >
                            {ev.event_image ? (
                                <Image source={{ uri: ev.event_image }} style={styles.eventImg} contentFit="cover" />
                            ) : (
                                <View style={[styles.eventImg, styles.eventImgPlaceholder]}>
                                    <Calendar size={18} color="#A855F7" />
                                </View>
                            )}
                            <Text style={[styles.eventName, { color: main }]} numberOfLines={1}>
                                {ev.event_name}
                            </Text>
                            <ChevronRight size={16} color={muted as any} />
                        </TouchableOpacity>
                    ))}
                </BottomSheetView>
            </BottomSheetModal>
        </>
    );
}

const getStyles = () => StyleSheet.create({
    button: {
        width: "100%",
        height: 44,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
    },
    contentWrap: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
    },
    iconPair: {
        flexDirection: "row",
        alignItems: "center",
    },
    zap: {
        marginLeft: -3,
        marginTop: -8,
    },
    buttonText: {
        includeFontPadding: false,
        color: "white",
        fontSize: 15,
        fontWeight: "600",
    },
    sheetBody: {
        paddingHorizontal: 20,
        paddingBottom: 36,
        paddingTop: 4,
    },
    sheetTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 18,
        includeFontPadding: false,
    },
    sheetSub: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        marginTop: 4,
        marginBottom: 14,
        includeFontPadding: false,
    },
    eventRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    eventImg: {
        width: 40,
        height: 40,
        borderRadius: 10,
    },
    eventImgPlaceholder: {
        backgroundColor: "rgba(168,85,247,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    eventName: {
        flex: 1,
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },
});
