import React, { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, useColorScheme, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Smartphone, ChevronRight, Calendar } from "lucide-react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import haptics from "@/src/utils/haptics";
import { MOTION } from "@/constants/motion";
import { space, radius, colors, type as typeScale } from "@/src/theme/tokens";
import { useActiveCheckin } from "@/hooks/useActiveCheckin";
import { getActiveCheckins, ActiveEvent } from "@/src/api/active.checkin";
import { resolveTapMode } from "@/src/utils/resolveTapMode";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";
import { useSheetBackHandler } from "@/hooks/useSheetBackHandler";

/**
 * Tap to Meet — the profile's primary action.
 * Checked in to one active event -> event networking screen (label shows the event).
 * Checked in to several -> chooser sheet.
 * Not at an event -> IRL mode (no event, no geofence).
 * Simulators/emulators can't broadcast NFC/BLE, so the button disables there.
 */

const EVENT_LABEL_MAX = 14;

function truncateEventName(name: string): string {
    const trimmed = name.trim();
    return trimmed.length > EVENT_LABEL_MAX ? `${trimmed.slice(0, EVENT_LABEL_MAX).trimEnd()}…` : trimmed;
}

export function TapToMeetButton() {
    const router = useRouter();
    const isDark = useColorScheme() === "dark";
    const chooserRef = useRef<BottomSheetModal>(null);
    const [busy, setBusy] = useState(false);
    const [choices, setChoices] = useState<ActiveEvent[]>([]);
    const [chooserOpen, setChooserOpen] = useState(false);
    const { activeEvents } = useActiveCheckin();

    const disabled = !Device.isDevice;
    const disabledReason = disabled ? "Tap to Meet needs a physical device with NFC or Bluetooth." : null;

    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const label =
        activeEvents.length === 1
            ? `Tap to Meet · at ${truncateEventName(activeEvents[0].event_name)}`
            : "Tap to Meet";

    const openForEvent = useCallback((eventId: number) => {
        chooserRef.current?.dismiss();
        router.push(`/event-nfc-share?eventId=${eventId}` as any);
    }, [router]);

    const handlePress = useCallback(async () => {
        if (busy || disabled) return;
        haptics.impact('light');
        setBusy(true);
        let events: ActiveEvent[] = activeEvents;
        try {
            // Never keep someone waiting on a slow network — the server
            // re-resolves the mode when the tap code is generated anyway.
            const fresh = await Promise.race<ActiveEvent[] | null>([
                getActiveCheckins(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (fresh) events = fresh;
            else walletLogger.warn(WalletTag.PROXIMITY, 'Active check-in fetch slow; using cached list');
        } catch (e) {
            walletLogger.warn(WalletTag.PROXIMITY, 'Active check-in fetch failed; using cached list');
        }
        setBusy(false);

        const resolved = resolveTapMode(events);
        walletLogger.info(WalletTag.PROXIMITY, 'Tap to Meet mode resolved', { mode: resolved.mode });
        if (resolved.mode === 'event') {
            openForEvent(resolved.eventId);
        } else if (resolved.mode === 'choose') {
            setChoices(resolved.events);
            chooserRef.current?.present();
        } else {
            router.push("/event-nfc-share?mode=irl" as any);
        }
    }, [busy, disabled, activeEvents, openForEvent, router]);

    useSheetBackHandler(chooserOpen, () => chooserRef.current?.dismiss());

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} pressBehavior="close" />
        ),
        []
    );

    const sheetBg = isDark ? colors.card : "#FFFFFF";
    const main = isDark ? colors.text : "#111827";
    const mutedColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.5)";
    const divider = isDark ? colors.border : "rgba(0,0,0,0.06)";

    return (
        <>
            <Pressable
                onPress={handlePress}
                onPressIn={() => { if (!disabled) scale.value = withSpring(MOTION.press.scale, MOTION.spring.snappy); }}
                onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy); }}
                disabled={disabled || busy}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <Animated.View style={[animStyle, disabled && { opacity: 0.5 }]}>
                    <LinearGradient
                        style={styles.button}
                        colors={[colors.accent, colors.accentDeep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        {busy ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <View style={styles.contentWrap}>
                                <Smartphone color="white" size={18} />
                                <Text style={styles.buttonText} numberOfLines={1}>{label}</Text>
                            </View>
                        )}
                    </LinearGradient>
                </Animated.View>
            </Pressable>
            {disabledReason && (
                <Text style={[styles.reason, { color: mutedColor }]} numberOfLines={1}>
                    {disabledReason}
                </Text>
            )}

            <BottomSheetModal
                ref={chooserRef}
                index={0}
                onChange={(index) => setChooserOpen(index >= 0)}
                onDismiss={() => setChooserOpen(false)}
                enableDynamicSizing
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: sheetBg }}
                handleIndicatorStyle={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
            >
                <BottomSheetView style={styles.sheetBody}>
                    <Text style={[styles.sheetTitle, { color: main }]}>Tap to Meet</Text>
                    <Text style={[styles.sheetSub, { color: mutedColor }]}>
                        You're checked in to a few events — pick where you're meeting.
                    </Text>
                    {choices.map((ev) => (
                        <Pressable
                            key={ev.event_id}
                            style={({ pressed }) => [styles.eventRow, { borderColor: divider, opacity: pressed ? 0.7 : 1 }]}
                            android_ripple={{ color: 'rgba(168,85,247,0.2)', borderless: false }}
                            onPress={() => {
                                haptics.selection();
                                openForEvent(ev.event_id);
                            }}
                        >
                            {ev.event_image ? (
                                <Image source={{ uri: ev.event_image }} style={styles.eventImg} contentFit="cover" />
                            ) : (
                                <View style={[styles.eventImg, styles.eventImgPlaceholder]}>
                                    <Calendar size={18} color={colors.accent} />
                                </View>
                            )}
                            <Text style={[styles.eventName, { color: main }]} numberOfLines={1}>
                                {ev.event_name}
                            </Text>
                            <ChevronRight size={16} color={mutedColor as any} />
                        </Pressable>
                    ))}
                </BottomSheetView>
            </BottomSheetModal>
        </>
    );
}

const styles = StyleSheet.create({
    button: {
        width: "100%",
        height: 52,
        borderRadius: radius.lg,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: space.lg,
    },
    contentWrap: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: space.sm,
    },
    buttonText: {
        includeFontPadding: false,
        color: colors.text,
        fontSize: typeScale.body,
        lineHeight: typeScale.body + 2,
        fontWeight: "600",
        flexShrink: 1,
    },
    reason: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.caption,
        includeFontPadding: false,
        marginTop: space.xs + 2,
        textAlign: "center",
    },
    sheetBody: {
        paddingHorizontal: space.xl - space.xs,
        paddingBottom: space.xxl + space.xs,
        paddingTop: space.xs,
    },
    sheetTitle: {
        fontFamily: "Dank Mono Bold",
        fontSize: 18,
        includeFontPadding: false,
    },
    sheetSub: {
        fontFamily: "Dank Mono",
        fontSize: typeScale.mono,
        marginTop: space.xs,
        marginBottom: space.md + 2,
        includeFontPadding: false,
    },
    eventRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: space.sm + 2,
        borderBottomWidth: 1,
    },
    eventImg: {
        width: 40,
        height: 40,
        borderRadius: radius.sm,
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
