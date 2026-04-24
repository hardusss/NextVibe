import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useColorScheme, FlatList, ActivityIndicator } from "react-native";
import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModal,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "@react-native-community/blur";
import { Users, Check } from "lucide-react-native";
import FastImage from "react-native-fast-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { getEventAttendees } from "@/src/api/event.requests";

export interface AttendeesSheetRef {
    presentForPost: (postId: number, eventTitle?: string) => void;
    dismiss: () => void;
}

const AttendeesSheet = forwardRef<AttendeesSheetRef>((_, ref) => {
    const isDark = useColorScheme() === "dark";
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [attendees, setAttendees] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [eventTitle, setEventTitle] = useState<string | undefined>(undefined);

    const snapPoints = useMemo(() => ["60%", "88%"], []);
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
        presentForPost: async (postId: number, title?: string) => {
            setAttendees([]);
            setEventTitle(title);
            setLoading(true);
            bottomSheetModalRef.current?.present();
            try {
                const data = await getEventAttendees(postId);
                setAttendees(data.attendees ?? []);
            } catch (e) {
                console.error("Failed to fetch attendees", e);
            } finally {
                setLoading(false);
            }
        },
        dismiss: () => bottomSheetModalRef.current?.dismiss(),
    }));

    const renderAttendee = ({ item, index }: { item: any; index: number }) => {
        const avatarUrl = item.avatar
            ? item.avatar.startsWith("http")
                ? item.avatar
                : `https://nextvibe.s3.amazonaws.com/${item.avatar}`
            : null;

        return (
            <Animated.View
                entering={FadeInDown.delay(index * 40).springify().damping(20)}
                style={[styles.attendeeRow, { backgroundColor: cardBg, borderColor: border }]}
            >
                {avatarUrl ? (
                    <FastImage source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: border }]}>
                        <Users size={16} color={muted} />
                    </View>
                )}
                <Text style={[styles.username, { color: main }]} numberOfLines={1}>
                    {item.username}
                </Text>
                <View style={styles.goingBadge}>
                    <Check size={11} color="#4ade80" strokeWidth={2.5} />
                    <Text style={styles.goingBadgeText}>Going</Text>
                </View>
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
        >
            <BottomSheetView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(168,85,247,0.14)", borderColor: border }]}>
                        <Users size={19} color={accent} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: main }]}>Who's going</Text>
                        {eventTitle ? (
                            <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>{eventTitle}</Text>
                        ) : (
                            <Text style={[styles.subtitle, { color: muted }]}>
                                {loading ? "Loading..." : `${attendees.length} approved attendee${attendees.length !== 1 ? "s" : ""}`}
                            </Text>
                        )}
                    </View>
                    {!loading && attendees.length > 0 && (
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{attendees.length}</Text>
                        </View>
                    )}
                </View>

                <View style={[styles.divider, { backgroundColor: border }]} />

                {loading ? (
                    <View style={styles.loaderWrap}>
                        <ActivityIndicator color={accent} size="large" />
                    </View>
                ) : attendees.length === 0 ? (
                    <Animated.View entering={FadeInDown.springify()} style={styles.emptyWrap}>
                        <View style={[styles.emptyIcon, { backgroundColor: "rgba(168,85,247,0.1)", borderColor: border }]}>
                            <Users size={28} color={accent} strokeWidth={1.5} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: main }]}>No attendees yet</Text>
                        <Text style={[styles.emptySubtitle, { color: muted }]}>
                            Approved attendees will appear here.
                        </Text>
                    </Animated.View>
                ) : (
                    <FlatList
                        data={attendees}
                        keyExtractor={item => item.user_id.toString()}
                        renderItem={renderAttendee}
                        contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </BottomSheetView>
        </BottomSheetModal>
    );
});

AttendeesSheet.displayName = "AttendeesSheet";

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
    divider: {
        height: 1,
        borderRadius: 1,
        marginBottom: 14,
    },
    loaderWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 60,
    },
    attendeeRow: {
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
    username: {
        fontFamily: "Dank Mono Bold",
        fontSize: 14,
        includeFontPadding: false,
        flex: 1,
    },
    goingBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(34,197,94,0.12)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    goingBadgeText: {
        fontFamily: "Dank Mono Bold",
        fontSize: 11,
        color: "#4ade80",
        includeFontPadding: false,
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

export default AttendeesSheet;
