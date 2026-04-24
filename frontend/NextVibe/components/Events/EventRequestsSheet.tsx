import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    StyleSheet,
    Text,
    View,
    useColorScheme,
    FlatList,
    Pressable,
} from "react-native";
import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModal,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "@react-native-community/blur";
import { Users, Check, X, Calendar, Clock } from "lucide-react-native";
import { actionEventRequest } from "@/src/api/event.requests";
import FastImage from "react-native-fast-image";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    FadeInDown,
    FadeOutUp,
    Layout,
    ZoomIn,
} from "react-native-reanimated";

export interface EventRequestsSheetRef {
    present: () => void;
    dismiss: () => void;
}

type Props = {
    requests: any[];
    onRefresh: () => void;
};

// Per-button processing state: { requestId: 'approve' | 'reject' | null }
type ProcessingState = Record<number, 'approve' | 'reject' | null>;

const timeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ActionButton({
    label,
    color,
    bgColor,
    icon,
    isLoading,
    isDisabled,
    onPress,
}: {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
    isLoading: boolean;
    isDisabled: boolean;
    onPress: () => void;
}) {
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: isDisabled && !isLoading ? 0.4 : 1,
    }));

    return (
        <AnimatedPressable
            style={[styles.actionBtn, { backgroundColor: bgColor }, animStyle]}
            disabled={isDisabled}
            onPressIn={() => { scale.value = withSpring(0.94, { damping: 18, stiffness: 300 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 300 }); }}
            onPress={onPress}
        >
            {isLoading ? (
                <Animated.View entering={ZoomIn.duration(150)}>
                    <SpinnerIcon color={color} />
                </Animated.View>
            ) : (
                <Animated.View entering={ZoomIn.duration(150)} style={styles.btnInner}>
                    {icon}
                    <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
                </Animated.View>
            )}
        </AnimatedPressable>
    );
}

function SpinnerIcon({ color }: { color: string }) {
    const rotation = useSharedValue(0);
    React.useEffect(() => {
        rotation.value = withTiming(360, { duration: 700 });
        const interval = setInterval(() => {
            rotation.value = 0;
            rotation.value = withTiming(360, { duration: 700 });
        }, 700);
        return () => clearInterval(interval);
    }, []);
    const style = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));
    return (
        <Animated.View style={[{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color, borderTopColor: "transparent" }, style]} />
    );
}

function RequestCard({
    item,
    index,
    isDark,
    onAction,
    processingAction,
}: {
    item: any;
    index: number;
    isDark: boolean;
    onAction: (id: number, action: 'approve' | 'reject') => void;
    processingAction: 'approve' | 'reject' | null;
}) {
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const cardBg = isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.025)";

    const avatarUrl = item.avatar
        ? item.avatar.startsWith("http")
            ? item.avatar
            : `https://nextvibe.s3.amazonaws.com/${item.avatar}`
        : null;

    const statusColors = {
        pending:  { bg: "rgba(168,85,247,0.12)",  text: "#c084fc" },
        approved: { bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
        rejected: { bg: "rgba(239,68,68,0.12)",   text: "#f87171" },
    };
    const sc = statusColors[item.status as keyof typeof statusColors] ?? statusColors.pending;
    const isPending = item.status === "pending";

    return (
        <Animated.View
            entering={FadeInDown.delay(index * 55).springify().damping(20)}
            exiting={FadeOutUp.duration(220)}
            layout={Layout.springify().damping(20)}
            style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
        >
            {/* ── Avatar + meta ── */}
            <View style={styles.cardTop}>
                <View style={styles.avatarWrap}>
                    {avatarUrl ? (
                        <FastImage source={{ uri: avatarUrl }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: border }]}>
                            <Users size={16} color={muted} />
                        </View>
                    )}
                    {isPending && <View style={styles.pendingDot} />}
                </View>

                <View style={styles.metaBlock}>
                    <Text style={[styles.username, { color: main }]} numberOfLines={1}>
                        {item.username}
                    </Text>
                    <View style={styles.metaRow}>
                        <Clock size={11} color={muted} />
                        <Text style={[styles.time, { color: muted }]}>{timeAgo(item.created_at)}</Text>
                    </View>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>
                        {item.status.toUpperCase()}
                    </Text>
                </View>
            </View>

            {/* ── Event label ── */}
            {!!item.post_about && (
                <View style={styles.eventLabelRow}>
                    <Calendar size={12} color="#c084fc" />
                    <Text style={[styles.eventLabel, { color: muted }]} numberOfLines={2}>
                        {item.post_about}
                    </Text>
                </View>
            )}

            {/* ── Actions (only for pending) ── */}
            {isPending && (
                <View style={styles.actionsRow}>
                    <ActionButton
                        label="Reject"
                        color="#f87171"
                        bgColor="rgba(239,68,68,0.12)"
                        icon={<X size={15} color="#f87171" strokeWidth={2.2} />}
                        isLoading={processingAction === "reject"}
                        isDisabled={processingAction !== null}
                        onPress={() => onAction(item.id, "reject")}
                    />
                    <ActionButton
                        label="Approve"
                        color="#4ade80"
                        bgColor="rgba(34,197,94,0.12)"
                        icon={<Check size={15} color="#4ade80" strokeWidth={2.2} />}
                        isLoading={processingAction === "approve"}
                        isDisabled={processingAction !== null}
                        onPress={() => onAction(item.id, "approve")}
                    />
                </View>
            )}
        </Animated.View>
    );
}

const EventRequestsSheet = forwardRef<EventRequestsSheetRef, Props>(({ requests, onRefresh }, ref) => {
    const isDark = useColorScheme() === "dark";
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [processing, setProcessing] = useState<ProcessingState>({});

    const snapPoints = useMemo(() => ["88%"], []);
    const accent = "#A855F7";
    const main = isDark ? "#ffffff" : "#111827";
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
    const bg = isDark ? "#0c0118" : "#ffffff";

    const backdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close">
                <BlurView style={StyleSheet.absoluteFill} blurType={isDark ? "dark" : "light"} blurAmount={3} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.2)" }]} />
            </BottomSheetBackdrop>
        ),
        [isDark]
    );

    useImperativeHandle(ref, () => ({
        present: () => bottomSheetModalRef.current?.present(),
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const handleAction = async (requestId: number, action: 'approve' | 'reject') => {
        setProcessing(prev => ({ ...prev, [requestId]: action }));
        try {
            await actionEventRequest(requestId, action);
            onRefresh();
        } catch (e) {
            console.error("Action failed", e);
        } finally {
            setProcessing(prev => {
                const next = { ...prev };
                delete next[requestId];
                return next;
            });
        }
    };

    const sortedRequests = useMemo(() =>
        [...requests].sort((a, b) => {
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (a.status !== "pending" && b.status === "pending") return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
        [requests]
    );

    const pendingCount = requests.filter(r => r.status === "pending").length;

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
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(168,85,247,0.14)", borderColor: border }]}>
                        <Users size={19} color={accent} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: main }]}>Event Requests</Text>
                        <Text style={[styles.subtitle, { color: muted }]}>
                            {pendingCount > 0
                                ? `${pendingCount} pending · ${requests.length} total`
                                : `${requests.length} total requests`}
                        </Text>
                    </View>
                    {pendingCount > 0 && (
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                        </View>
                    )}
                </View>

                {/* ── Divider ── */}
                <View style={[styles.divider, { backgroundColor: border }]} />

                {/* ── List ── */}
                {sortedRequests.length === 0 ? (
                    <Animated.View entering={FadeInDown.springify()} style={styles.emptyWrap}>
                        <View style={[styles.emptyIcon, { backgroundColor: "rgba(168,85,247,0.1)", borderColor: border }]}>
                            <Users size={28} color={accent} strokeWidth={1.5} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: main }]}>No requests yet</Text>
                        <Text style={[styles.emptySubtitle, { color: muted }]}>
                            Requests to attend your events will appear here.
                        </Text>
                    </Animated.View>
                ) : (
                    <FlatList
                        data={sortedRequests}
                        keyExtractor={item => item.id.toString()}
                        renderItem={({ item, index }) => (
                            <RequestCard
                                item={item}
                                index={index}
                                isDark={isDark}
                                onAction={handleAction}
                                processingAction={processing[item.id] ?? null}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: 48, paddingTop: 4 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </BottomSheetView>
        </BottomSheetModal>
    );
});

EventRequestsSheet.displayName = "EventRequestsSheet";

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
        paddingBottom: 16,
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
    pendingBadge: {
        minWidth: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: "rgba(168,85,247,0.85)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
    },
    pendingBadgeText: {
        color: "#fff",
        fontFamily: "Dank Mono Bold",
        fontSize: 12,
        includeFontPadding: false,
    },
    divider: {
        height: 1,
        borderRadius: 1,
        marginBottom: 14,
    },
    // ── Card ──────────────────────────────────────────
    card: {
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
    },
    cardTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 10,
    },
    avatarWrap: {
        position: "relative",
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
    pendingDot: {
        position: "absolute",
        bottom: 1,
        right: 1,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#c084fc",
        borderWidth: 2,
        borderColor: "#0c0118",
    },
    metaBlock: {
        flex: 1,
        gap: 3,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    username: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
    },
    time: {
        fontFamily: "Dank Mono",
        fontSize: 11,
        includeFontPadding: false,
    },
    statusBadge: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    statusText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 10,
        letterSpacing: 0.5,
    },
    eventLabelRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        marginBottom: 12,
        paddingLeft: 2,
    },
    eventLabel: {
        fontFamily: "Dank Mono",
        fontSize: 12,
        lineHeight: 17,
        flex: 1,
    },
    // ── Actions ───────────────────────────────────────
    actionsRow: {
        flexDirection: "row",
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        height: 40,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
    },
    btnInner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    actionBtnText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
        includeFontPadding: false,
    },
    // ── Empty ─────────────────────────────────────────
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

export default EventRequestsSheet;
