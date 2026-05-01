import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    StyleSheet, Text, View, useColorScheme, FlatList,
    ActivityIndicator, TouchableOpacity, Vibration,
} from "react-native";
import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModal,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "@react-native-community/blur";
import { Nfc, Users, Check, X, Radio } from "lucide-react-native";
import FastImage from "react-native-fast-image";
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { getCheckinList } from "@/src/api/event.checkin";
import { startSharing, stopSharing, addNfcReadListener } from "@/modules/nfc-send";

export interface NfcCheckinSheetRef {
    presentForPost: (postId: number, eventTitle?: string) => void;
    dismiss: () => void;
}

const AnimatedNfc = Animated.createAnimatedComponent(Nfc);

const NfcCheckinSheet = forwardRef<NfcCheckinSheetRef>((_, ref) => {
    const isDark = useColorScheme() === "dark";
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [checkins, setCheckins] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [postId, setPostId] = useState<number | null>(null);
    const [eventTitle, setEventTitle] = useState<string | undefined>(undefined);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [tapCount, setTapCount] = useState(0);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const removeListenerRef = useRef<{ remove: () => void } | null>(null);
    const lastReadTimestamp = useRef<number>(0);

    const snapPoints = useMemo(() => ["65%", "90%"], []);
    const accent = "#A855F7";
    const bg = isDark ? "#0c0118" : "#ffffff";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const cardBg = isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.025)";
    const accentText = isDark ? "#d8b4fe" : "#7c3aed";

    // Pulse animation for NFC icon
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(1);

    useEffect(() => {
        if (isBroadcasting) {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.2, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ), -1, true
            );
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.4, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ), -1, true
            );
        } else {
            pulseScale.value = withTiming(1, { duration: 300 });
            pulseOpacity.value = withTiming(1, { duration: 300 });
        }
    }, [isBroadcasting]);

    const animatedIconStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const fetchCheckins = useCallback(async (pid: number) => {
        try {
            const data = await getCheckinList(pid);
            setCheckins(data.checkins ?? []);
        } catch (e) {
            console.error("Failed to fetch checkins", e);
        }
    }, []);

    const startPolling = useCallback((pid: number) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        fetchCheckins(pid);
        pollingRef.current = setInterval(() => fetchCheckins(pid), 3000);
    }, [fetchCheckins]);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const startNfcBroadcast = useCallback((pid: number) => {
        if (isBroadcasting) return;
        try {
            const url = `nextvibe://event-checkin/${pid}`;

            removeListenerRef.current = addNfcReadListener(() => {
                const now = Date.now();
                if (now - lastReadTimestamp.current > 2000) {
                    lastReadTimestamp.current = now;
                    setTapCount(prev => prev + 1);
                    Vibration.vibrate([0, 80, 60, 80]);
                    // Immediate poll after a tap
                    fetchCheckins(pid);
                }
            });

            startSharing(url);
            setIsBroadcasting(true);
        } catch (error) {
            console.error("Failed to start NFC broadcast:", error);
        }
    }, [isBroadcasting, fetchCheckins]);

    const stopNfcBroadcast = useCallback(() => {
        try {
            if (removeListenerRef.current) {
                removeListenerRef.current.remove();
                removeListenerRef.current = null;
            }
            stopSharing();
        } catch (e) {
            console.warn("Error stopping NFC:", e);
        } finally {
            setIsBroadcasting(false);
        }
    }, []);

    const cleanup = useCallback(() => {
        stopNfcBroadcast();
        stopPolling();
        setCheckins([]);
        setPostId(null);
        setEventTitle(undefined);
        setTapCount(0);
        setLoading(false);
    }, [stopNfcBroadcast, stopPolling]);

    useImperativeHandle(ref, () => ({
        presentForPost: async (pid: number, title?: string) => {
            setCheckins([]);
            setPostId(pid);
            setEventTitle(title);
            setTapCount(0);
            setLoading(true);
            bottomSheetModalRef.current?.present();

            try {
                await fetchCheckins(pid);
            } finally {
                setLoading(false);
            }

            startNfcBroadcast(pid);
            startPolling(pid);
        },
        dismiss: () => {
            cleanup();
            bottomSheetModalRef.current?.dismiss();
        },
    }));

    const backdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close">
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={3} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)" }]} />
            </BottomSheetBackdrop>
        ),
        [isDark]
    );

    const registeredCount = checkins.filter(c => c.is_registered).length;
    const unregisteredCount = checkins.length - registeredCount;

    const renderCheckin = ({ item, index }: { item: any; index: number }) => {
        const avatarUrl = item.avatar
            ? item.avatar.startsWith("http")
                ? item.avatar
                : `https://nextvibe.s3.amazonaws.com/${item.avatar}`
            : null;

        const checkinTime = new Date(item.checked_in_at);
        const timeStr = checkinTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return (
            <Animated.View
                entering={FadeInDown.delay(index * 40).springify().damping(20)}
                style={[styles.checkinRow, { backgroundColor: cardBg, borderColor: border }]}
            >
                {avatarUrl ? (
                    <FastImage source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: border }]}>
                        <Users size={16} color={muted} />
                    </View>
                )}

                <View style={styles.userInfo}>
                    <Text style={[styles.username, { color: main }]} numberOfLines={1}>
                        {item.username}
                    </Text>
                    <Text style={[styles.timeText, { color: muted }]}>
                        {timeStr}
                    </Text>
                </View>

                {item.is_registered ? (
                    <View style={styles.verifiedBadge}>
                        <Check size={11} color="#4ade80" strokeWidth={2.5} />
                        <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                ) : (
                    <View style={styles.unregisteredBadge}>
                        <X size={11} color="#f87171" strokeWidth={2.5} />
                        <Text style={styles.unregisteredText}>Not registered</Text>
                    </View>
                )}
            </Animated.View>
        );
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={snapPoints}
            index={0}
            backdropComponent={backdrop}
            backgroundStyle={{ backgroundColor: bg }}
            handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)", width: 40, height: 4 }}
            onDismiss={cleanup}
        >
            <BottomSheetView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(168,85,247,0.14)", borderColor: border }]}>
                        <Animated.View style={animatedIconStyle}>
                            <Nfc size={19} color={accent} strokeWidth={1.8} />
                        </Animated.View>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: main }]}>NFC Check-in</Text>
                        {eventTitle ? (
                            <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>{eventTitle}</Text>
                        ) : (
                            <Text style={[styles.subtitle, { color: muted }]}>
                                {isBroadcasting ? "Broadcasting..." : "Ready to scan"}
                            </Text>
                        )}
                    </View>
                    {checkins.length > 0 && (
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{checkins.length}</Text>
                        </View>
                    )}
                </View>

                {/* NFC Status Bar */}
                <View style={[styles.nfcStatusBar, {
                    backgroundColor: isBroadcasting ? "rgba(5,240,216,0.08)" : "rgba(168,85,247,0.08)",
                    borderColor: isBroadcasting ? "rgba(5,240,216,0.2)" : "rgba(168,85,247,0.2)",
                }]}>
                    <Radio
                        size={14}
                        color={isBroadcasting ? "#05f0d8" : accentText}
                        strokeWidth={2}
                    />
                    <Text style={[styles.nfcStatusText, {
                        color: isBroadcasting ? "#05f0d8" : accentText,
                    }]}>
                        {isBroadcasting
                            ? `Broadcasting · ${tapCount} tap${tapCount !== 1 ? "s" : ""} detected`
                            : "NFC not active"
                        }
                    </Text>
                </View>

                {/* Stats Row */}
                {checkins.length > 0 && (
                    <View style={styles.statsRow}>
                        <View style={[styles.statChip, { backgroundColor: "rgba(34,197,94,0.1)" }]}>
                            <Check size={12} color="#4ade80" strokeWidth={2} />
                            <Text style={[styles.statText, { color: "#4ade80" }]}>
                                {registeredCount} verified
                            </Text>
                        </View>
                        {unregisteredCount > 0 && (
                            <View style={[styles.statChip, { backgroundColor: "rgba(239,68,68,0.1)" }]}>
                                <X size={12} color="#f87171" strokeWidth={2} />
                                <Text style={[styles.statText, { color: "#f87171" }]}>
                                    {unregisteredCount} unregistered
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <View style={[styles.divider, { backgroundColor: border }]} />

                {/* Checkin List */}
                {loading ? (
                    <View style={styles.loaderWrap}>
                        <ActivityIndicator color={accent} size="large" />
                    </View>
                ) : checkins.length === 0 ? (
                    <Animated.View entering={FadeInDown.springify()} style={styles.emptyWrap}>
                        <View style={[styles.emptyIcon, { backgroundColor: "rgba(168,85,247,0.1)", borderColor: border }]}>
                            <Nfc size={28} color={accent} strokeWidth={1.5} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: main }]}>No check-ins yet</Text>
                        <Text style={[styles.emptySubtitle, { color: muted }]}>
                            Hold your phone near attendees' devices to verify their attendance.
                        </Text>
                    </Animated.View>
                ) : (
                    <FlatList
                        data={checkins}
                        keyExtractor={item => item.user_id.toString()}
                        renderItem={renderCheckin}
                        contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </BottomSheetView>
        </BottomSheetModal>
    );
});

NfcCheckinSheet.displayName = "NfcCheckinSheet";

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingBottom: 14,
    },
    iconBadge: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontFamily: "Dank Mono Bold",
        fontSize: 17,
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        marginTop: 3,
        includeFontPadding: false,
    },
    countBadge: {
        minWidth: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: "rgba(168,85,247,0.85)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
    },
    countBadgeText: {
        color: "#fff",
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    // NFC Status
    nfcStatusBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    nfcStatusText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    // Stats
    statsRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
    },
    statChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    statText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        includeFontPadding: false,
    },
    divider: {
        height: 1,
        borderRadius: 1,
        marginBottom: 14,
    },
    // Checkin rows
    checkinRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarFallback: {
        alignItems: "center",
        justifyContent: "center",
    },
    userInfo: {
        flex: 1,
        gap: 2,
    },
    username: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    timeText: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
    verifiedBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(34,197,94,0.12)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    verifiedText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        color: "#4ade80",
        includeFontPadding: false,
    },
    unregisteredBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(239,68,68,0.12)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    unregisteredText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        color: "#f87171",
        includeFontPadding: false,
    },
    // Empty / Loader
    loaderWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 60,
    },
    emptyWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 60,
        gap: 10,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 6,
    },
    emptyTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 16,
        includeFontPadding: false,
    },
    emptySubtitle: {
        fontFamily: "Dank Mono",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 19,
        includeFontPadding: false,
        paddingHorizontal: 20,
    },
});

export default NfcCheckinSheet;
