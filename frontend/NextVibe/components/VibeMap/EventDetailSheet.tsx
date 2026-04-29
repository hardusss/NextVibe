import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    StyleSheet, Text, View, useColorScheme, TouchableOpacity,
    ActivityIndicator, Linking, Vibration,
} from "react-native";
import {
    BottomSheetBackdrop, BottomSheetBackdropProps,
    BottomSheetModal, BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "@react-native-community/blur";
import { Calendar, Users, Send, ExternalLink, MapPin, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react-native";
import FastImage from "react-native-fast-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { VibemapEventItem } from "@/src/api/get.vibemap.events";
import { requestToAttend } from "@/src/api/event.requests";

export interface EventDetailSheetRef {
    present: (event: VibemapEventItem) => void;
    dismiss: () => void;
}

const formatEventDate = (isoString: string): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

const EventDetailSheet = forwardRef<EventDetailSheetRef>((_, ref) => {
    const isDark = useColorScheme() === "dark";
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [event, setEvent] = useState<VibemapEventItem | null>(null);
    const [requestStatus, setRequestStatus] = useState<string | null>(null);
    const [isRequesting, setIsRequesting] = useState(false);

    const snapPoints = useMemo(() => ["62%"], []);

    const accent = "#A855F7";
    const bg = isDark ? "#0c0118" : "#ffffff";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const cardBg = isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.025)";

    const backdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close">
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={3} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)" }]} />
            </BottomSheetBackdrop>
        ),
        [isDark]
    );

    useImperativeHandle(ref, () => ({
        present: (ev: VibemapEventItem) => {
            setEvent(ev);
            setRequestStatus(ev.request_status);
            setIsRequesting(false);
            bottomSheetModalRef.current?.present();
        },
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const handleRequestToAttend = async () => {
        if (!event || isRequesting || requestStatus) return;
        setIsRequesting(true);
        Vibration.vibrate(20);
        try {
            await requestToAttend(event.post_id);
            setRequestStatus("pending");
            Vibration.vibrate([0, 40, 60, 80]);
        } catch (e) {
            console.error("Failed to request attendance", e);
        } finally {
            setIsRequesting(false);
        }
    };

    const statusConfig = useMemo(() => {
        if (requestStatus === "approved") return {
            label: "Approved", color: "#4ade80",
            bg: "rgba(34,197,94,0.12)", icon: <CheckCircle2 size={16} color="#4ade80" strokeWidth={2} />
        };
        if (requestStatus === "pending") return {
            label: "Pending", color: "#c084fc",
            bg: "rgba(168,85,247,0.12)", icon: <Clock size={16} color="#c084fc" strokeWidth={2} />
        };
        if (requestStatus === "rejected") return {
            label: "Rejected", color: "#f87171",
            bg: "rgba(239,68,68,0.12)", icon: <XCircle size={16} color="#f87171" strokeWidth={2} />
        };
        return null;
    }, [requestStatus]);

    if (!event) return null;

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={snapPoints}
            index={0}
            backdropComponent={backdrop}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)", width: 40, height: 4 }}
        >
            <BottomSheetView style={styles.container}>
                <Animated.View entering={FadeInDown.delay(50).springify().damping(20)}>
                    {/* Hero image + overlay */}
                    {event.image && (
                        <View style={[styles.heroContainer, { borderColor: border }]}>
                            <FastImage source={{ uri: event.image }} style={styles.heroImage} resizeMode="cover" />
                            <View style={styles.heroOverlay} />
                            {/* Status badge on image */}
                            <View style={[styles.statusBadgeOnImage, {
                                backgroundColor: event.is_active ? "rgba(5,240,216,0.18)" : "rgba(255,255,255,0.12)",
                            }]}>
                                <View style={[styles.statusDot, {
                                    backgroundColor: event.is_active ? "#05f0d8" : "#999",
                                }]} />
                                <Text style={[styles.statusBadgeText, {
                                    color: event.is_active ? "#05f0d8" : "#999",
                                }]}>
                                    {event.is_active ? "Active" : "Ended"}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Event info */}
                    <View style={styles.infoSection}>
                        {/* Title / about */}
                        {!!event.about && (
                            <Text style={[styles.title, { color: main }]} numberOfLines={3}>
                                {event.about}
                            </Text>
                        )}

                        {/* Owner */}
                        <View style={[styles.ownerRow, { borderColor: border }]}>
                            {event.owner_avatar ? (
                                <FastImage source={{ uri: event.owner_avatar }} style={styles.ownerAvatar} />
                            ) : (
                                <View style={[styles.ownerAvatar, { backgroundColor: border }]} />
                            )}
                            <Text style={[styles.ownerName, { color: muted }]} numberOfLines={1}>
                                @{event.owner_username}
                            </Text>
                        </View>

                        {/* Date & attendees row */}
                        <View style={styles.metaRow}>
                            {event.luma_event_start_time && (
                                <View style={[styles.metaChip, { backgroundColor: cardBg, borderColor: border }]}>
                                    <Calendar size={14} color="#d8b4fe" />
                                    <Text style={[styles.metaChipText, { color: "#d8b4fe" }]} numberOfLines={1}>
                                        {formatEventDate(event.luma_event_start_time)}
                                    </Text>
                                </View>
                            )}
                            <View style={[styles.metaChip, { backgroundColor: cardBg, borderColor: border }]}>
                                <Users size={14} color="#c084fc" strokeWidth={1.8} />
                                <Text style={[styles.metaChipText, { color: "#c084fc" }]}>
                                    {event.attendee_count} going
                                </Text>
                            </View>
                        </View>

                        {/* Action buttons */}
                        <View style={styles.actionsSection}>
                            {/* Request to attend / status */}
                            {statusConfig ? (
                                <View style={[styles.statusResultRow, { backgroundColor: statusConfig.bg }]}>
                                    {statusConfig.icon}
                                    <Text style={[styles.statusResultText, { color: statusConfig.color }]}>
                                        {statusConfig.label}
                                    </Text>
                                </View>
                            ) : event.is_active ? (
                                <TouchableOpacity
                                    style={[styles.attendBtn, isRequesting && { opacity: 0.6 }]}
                                    activeOpacity={0.78}
                                    onPress={handleRequestToAttend}
                                    disabled={isRequesting}
                                >
                                    {isRequesting ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <>
                                            <Send size={16} color="#fff" strokeWidth={2} />
                                            <Text style={styles.attendBtnText}>Request to Attend</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : null}

                            {/* Luma link */}
                            {event.luma_event_url && (
                                <TouchableOpacity
                                    style={[styles.lumaBtn, { backgroundColor: cardBg, borderColor: border }]}
                                    activeOpacity={0.78}
                                    onPress={() => Linking.openURL(event.luma_event_url!)}
                                >
                                    <ExternalLink size={15} color="#d8b4fe" strokeWidth={1.8} />
                                    <Text style={styles.lumaBtnText}>View on Luma</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </Animated.View>
            </BottomSheetView>
        </BottomSheetModal>
    );
});

EventDetailSheet.displayName = "EventDetailSheet";

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 4,
    },
    heroContainer: {
        width: "100%",
        height: 160,
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        marginBottom: 18,
    },
    heroImage: {
        width: "100%",
        height: "100%",
    },
    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.15)",
    },
    statusBadgeOnImage: {
        position: "absolute",
        top: 12,
        right: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    statusBadgeText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        includeFontPadding: false,
    },
    infoSection: {
        gap: 14,
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 18,
        includeFontPadding: false,
        lineHeight: 24,
    },
    ownerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    ownerAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
    },
    ownerName: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        includeFontPadding: false,
        flex: 1,
    },
    metaRow: {
        flexDirection: "row",
        gap: 10,
        flexWrap: "wrap",
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    metaChipText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    actionsSection: {
        gap: 10,
        marginTop: 4,
    },
    attendBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#7c3aed",
        paddingVertical: 14,
        borderRadius: 14,
    },
    attendBtnText: {
        color: "#fff",
        fontFamily: "Dank Mono Bold",
        fontSize: 15,
        includeFontPadding: false,
    },
    statusResultRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
    },
    statusResultText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    lumaBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    lumaBtnText: {
        color: "#d8b4fe",
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        includeFontPadding: false,
    },
});

export default EventDetailSheet;
