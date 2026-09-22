import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useColorScheme, useWindowDimensions } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';

import EventCta from '@/components/Events/EventCta';
import MeetCardPreview, { MEET_CARD_ASPECT } from '@/components/Meet/MeetCardPreview';
import MeetShareActions from '@/components/Meet/MeetShareActions';
import { useMeet } from '@/components/Meet/useMeet';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { closeMeetSheet, useMeetSheet } from '@/src/stores/meetSheetStore';
import { storage } from '@/src/utils/storage';
import { track } from '@/src/utils/analytics';
import { colors, radius, space, type as typeScale } from '@/src/theme/tokens';

/**
 * iOS: above everything, native-stack modals included (UIKit won't present a
 * sheet from the root view while one is up). Same as the Seeker sheet.
 */
const IosOverlayContainer = ({ children }: React.PropsWithChildren) => (
    <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
);
const containerComponent = Platform.OS === 'ios' ? IosOverlayContainer : undefined;

/**
 * One Proof of Meet: the card as it will be saved, Share on X, Save image
 * and Copy link. Opened from nextvibe.io/u/meet/<slug> (link or push, through
 * the pending-intent gate) and from POAPs & History. Mounted once in the root
 * layout; state in src/stores/meetSheetStore.
 */
export default function MeetSheet() {
    const slug = useMeetSheet((s) => s.slug);
    const source = useMeetSheet((s) => s.source);
    const openCount = useMeetSheet((s) => s.openCount);
    const sheetRef = useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [open, setOpen] = useState(false);
    const [viewerId, setViewerId] = useState<number | null>(null);
    const [state, retry] = useMeet(slug, openCount);

    useEffect(() => {
        if (!slug) return;
        storage.getItem('id').then((id) => setViewerId(id ? Number(id) : null)).catch(() => {});
        sheetRef.current?.present();
        track('meet_sheet_opened', { source: source ?? 'history' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, openCount]);

    const close = useCallback(() => sheetRef.current?.dismiss(), []);
    useSheetBackHandler(open, close);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} pressBehavior="close" />
        ),
        []
    );

    // The card fits the screen: at most ~46% of its height, never wider than 300
    const previewWidth = Math.round(Math.max(150, Math.min(300, windowWidth - 2 * space.xxl, (windowHeight * 0.46) / MEET_CARD_ASPECT)));
    const meet = state.status === 'ready' ? state.meet : null;
    const other = meet ? (meet.users[0].user_id === viewerId ? meet.users[1] : meet.users[0]) : null;

    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.55)';
    const verified = meet && meet.tier !== 'in_person';
    const chipColor = verified ? '#2DD4BF' : colors.accent;

    return (
        <BottomSheetModal
            ref={sheetRef}
            containerComponent={containerComponent}
            stackBehavior="push"
            enableDynamicSizing
            maxDynamicContentSize={windowHeight - insets.top - space.xl}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: isDark ? '#0A0410' : '#F5F3FF' }}
            handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
            onChange={(index) => setOpen(index >= 0)}
            onDismiss={() => {
                setOpen(false);
                closeMeetSheet();
            }}
        >
            <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: main }]}>Proof of Meet</Text>
                    {meet && (
                        <View style={[styles.chip, { borderColor: `${chipColor}88`, backgroundColor: `${chipColor}1F` }]}>
                            {verified && <ShieldCheck size={12} color={chipColor} strokeWidth={2.4} />}
                            <Text style={[styles.chipText, { color: chipColor }]}>{meet.tier_label}</Text>
                        </View>
                    )}
                </View>

                {state.status === 'missing' ? (
                    <View style={styles.message}>
                        <Text style={[styles.messageTitle, { color: main }]}>This card isn't available</Text>
                        <Text style={[styles.messageText, { color: muted }]}>
                            The link may be wrong, or one of the two accounts is no longer visible to you.
                        </Text>
                        <View style={styles.actions}>
                            <EventCta label="Close" onPress={close} />
                        </View>
                    </View>
                ) : state.status === 'error' ? (
                    <View style={styles.message}>
                        <Text style={[styles.messageTitle, { color: main }]}>Couldn't load this card</Text>
                        <Text style={[styles.messageText, { color: muted }]}>Check your connection and try again.</Text>
                        <View style={styles.actions}>
                            <EventCta label="Try again" onPress={retry} />
                            <EventCta label="Close" variant="ghost" onPress={close} />
                        </View>
                    </View>
                ) : (
                    <>
                        {meet && <Text style={[styles.subtitle, { color: muted }]} numberOfLines={2}>{meet.when_line}</Text>}
                        <View style={styles.preview}>
                            <MeetCardPreview
                                uri={meet ? meet.story_url : null}
                                width={previewWidth}
                                placeholderAvatar={other?.avatar ?? null}
                                accessibilityLabel={meet ? `${meet.title}. ${meet.when_line}. ${meet.history_line}.` : undefined}
                            />
                        </View>
                        {slug && (
                            <View style={styles.actions}>
                                <MeetShareActions slug={slug} meet={meet} viewerId={viewerId} showCopyLink place="sheet" />
                                <TouchableOpacity style={styles.closeLink} onPress={close} hitSlop={8} accessibilityRole="button">
                                    <Text style={[styles.closeText, { color: muted }]}>Close</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    content: {
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingTop: space.xs,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.sm,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.h2,
        includeFontPadding: false,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    chipText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 11,
        letterSpacing: 0.6,
        includeFontPadding: false,
    },
    subtitle: {
        alignSelf: 'flex-start',
        fontFamily: 'Dank Mono',
        fontSize: typeScale.caption,
        marginTop: 4,
        includeFontPadding: false,
    },
    preview: {
        marginTop: space.lg,
        alignItems: 'center',
    },
    actions: {
        width: '100%',
        marginTop: space.lg,
        gap: space.sm,
    },
    closeLink: {
        alignSelf: 'center',
        marginTop: space.xs,
        paddingVertical: space.xs,
    },
    closeText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        includeFontPadding: false,
    },
    message: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: space.xl,
    },
    messageTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        textAlign: 'center',
        includeFontPadding: false,
    },
    messageText: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        marginTop: space.sm,
        includeFontPadding: false,
    },
});
