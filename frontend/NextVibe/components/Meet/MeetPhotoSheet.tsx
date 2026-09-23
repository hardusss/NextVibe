import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Camera, Check, Clock3, ShieldAlert, Sparkles } from 'lucide-react-native';

import EventCta from '@/components/Events/EventCta';
import CustomActivityIndicator from '@/components/CustomActivityIndicator';
import MeetCardPreview, { MEET_CARD_ASPECT } from '@/components/Meet/MeetCardPreview';
import MeetShareActions from '@/components/Meet/MeetShareActions';
import { useMeet } from '@/components/Meet/useMeet';
import { useMeetPhoto } from '@/components/Meet/useMeetPhoto';
import { startMeetSelfie } from '@/components/Meet/startMeetSelfie';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { decideMeetPhoto, MeetPhotoApiError, type MeetPhotoState } from '@/src/api/meetPhoto';
import { closeMeetPhotoSheet, useMeetPhotoStore } from '@/src/stores/meetPhotoStore';
import { storage } from '@/src/utils/storage';
import haptics from '@/src/utils/haptics';
import { track } from '@/src/utils/analytics';
import { colors, space, type as typeScale } from '@/src/theme/tokens';

/** Above everything on iOS, native-stack modals included (same as the meet sheet). */
const IosOverlayContainer = ({ children }: React.PropsWithChildren) => (
    <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
);
const containerComponent = Platform.OS === 'ios' ? IosOverlayContainer : undefined;

/** The consent sheet says plainly where an approved photo ends up. */
export const CONSENT_LINES = [
    'If you both approve, this photo becomes your Proof of Meet on Solana and can be shared publicly.',
    'This photo becomes public: on your profiles, on nextvibe.io and in a collectible on Solana.',
];

/**
 * One meet's selfie, in whatever state it's in (root layout, state in
 * src/stores/meetPhotoStore): the other person's consent request, "waiting
 * for their answer", minting, "Your Proof of Meet is ready" with Share on X,
 * and the photographer's results ("passed on this one", "can't be used").
 * Opened by socket events, pushes, the start-up inbox check and the tap
 * screens; the selfie screen keeps it away while it's open.
 */
export default function MeetPhotoSheet() {
    const slug = useMeetPhotoStore((s) => s.sheetSlug);
    const source = useMeetPhotoStore((s) => s.sheetSource);
    const openCount = useMeetPhotoStore((s) => s.sheetOpenCount);
    const sheetRef = useRef<BottomSheetModal>(null);
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [open, setOpen] = useState(false);
    const [viewerId, setViewerId] = useState<number | null>(null);
    const [busy, setBusy] = useState<'approve' | 'reject' | 'retake' | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const { load, data, set } = useMeetPhoto(slug);
    const minted = data?.status === 'minted';
    const [meetState] = useMeet(minted ? slug : null, openCount);
    const meet = meetState.status === 'ready' ? meetState.meet : null;

    useEffect(() => {
        if (!slug) return;
        setMessage(null);
        setBusy(null);
        storage.getItem('id').then((id) => setViewerId(id ? Number(id) : null)).catch(() => {});
        sheetRef.current?.present();
        track('meet_photo_sheet_opened', { source: source ?? 'tap' });
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

    const decide = async (approve: boolean) => {
        if (!slug || busy) return;
        setBusy(approve ? 'approve' : 'reject');
        setMessage(null);
        try {
            const next = await decideMeetPhoto(slug, approve);
            set(next);
            haptics.notification(approve ? 'success' : 'warning');
            track('meet_photo_decided', { approve });
            if (!approve) close();
        } catch (error) {
            haptics.notification('error');
            const err = error as MeetPhotoApiError;
            setMessage(err.message);
        } finally {
            setBusy(null);
        }
    };

    const retake = async () => {
        if (!slug || busy) return;
        setBusy('retake');
        setMessage(null);
        const result = await startMeetSelfie(router, slug, data?.other.username);
        setBusy(null);
        if (result.ok) {
            close();
        } else {
            haptics.notification('error');
            setMessage(result.error.message);
        }
    };

    const viewOnProfile = () => {
        close();
        router.navigate('/(tabs)/profile' as any);
    };

    const previewWidth = Math.round(Math.max(150, Math.min(300, windowWidth - 2 * space.xxl, (windowHeight * 0.44) / MEET_CARD_ASPECT)));
    const main = isDark ? colors.text : '#111827';
    const muted = isDark ? colors.sub : 'rgba(17,24,39,0.6)';

    const photo = data?.photo ?? null;
    const role = photo?.role ?? null;
    const photographer = photo?.photographer.username ?? '';
    const other = data?.other.username ?? '';

    const preview = (uri: string | null, label: string) => (
        <View style={styles.preview}>
            <MeetCardPreview uri={uri} width={previewWidth} placeholderAvatar={data?.other.avatar ?? null} accessibilityLabel={label} />
        </View>
    );

    const icon = (node: React.ReactNode, tint: string) => (
        <View style={[styles.iconCircle, { backgroundColor: `${tint}1F`, borderColor: `${tint}55` }]}>{node}</View>
    );

    const renderBody = (state: MeetPhotoState) => {
        const p = state.photo;
        const status = state.status;

        if (p && status === 'pending' && role === 'subject') {
            return (
                <>
                    <Text style={[styles.title, { color: main }]}>@{photographer} took your Proof of Meet photo</Text>
                    {preview(p.preview_url, `Selfie with @${photographer}, with the Proof of Meet details on it`)}
                    {CONSENT_LINES.map((line) => (
                        <Text key={line} style={[styles.text, { color: muted }]}>{line}</Text>
                    ))}
                    {message && <Text style={styles.error}>{message}</Text>}
                    <View style={styles.row}>
                        <View style={styles.flex}>
                            <EventCta label="Not this one" variant="secondary" onPress={() => decide(false)}
                                busy={busy === 'reject'} disabled={busy === 'approve'} />
                        </View>
                        <View style={styles.flex}>
                            <EventCta label="Use it" onPress={() => decide(true)} busy={busy === 'approve'}
                                disabled={busy === 'reject'} />
                        </View>
                    </View>
                </>
            );
        }

        if (p && status === 'pending') {
            return (
                <>
                    {icon(<Clock3 size={28} color={colors.accent} />, colors.accent)}
                    <Text style={[styles.title, { color: main }]}>Sent to @{other}</Text>
                    <Text style={[styles.text, { color: muted }]}>
                        They have 24 hours to say yes. If they do, it's minted for both of you and posted on both profiles.
                    </Text>
                    {preview(p.preview_url, `Your selfie with @${other}`)}
                    <View style={styles.actions}><EventCta label="OK" variant="secondary" onPress={close} /></View>
                </>
            );
        }

        if (p && status === 'approved') {
            return (
                <>
                    <Text style={[styles.title, { color: main }]}>
                        {role === 'photographer' ? `@${other} said yes` : 'You both said yes'}
                    </Text>
                    <View style={styles.inline}>
                        <CustomActivityIndicator size="small" />
                        <Text style={[styles.text, styles.inlineText, { color: muted }]}>Minting your Proof of Meet…</Text>
                    </View>
                    {preview(p.preview_url, `Your selfie with @${other}`)}
                    <View style={styles.actions}><EventCta label="OK" variant="secondary" onPress={close} /></View>
                </>
            );
        }

        if (p && status === 'minted') {
            return (
                <>
                    {icon(<Sparkles size={28} color="#2DD4BF" />, '#2DD4BF')}
                    <Text style={[styles.title, { color: main }]}>Your Proof of Meet is ready</Text>
                    {preview(meet?.story_url ?? p.preview_url, `Your Proof of Meet with @${other}`)}
                    {p.waiting_for_wallet && (
                        <Text style={[styles.text, { color: muted }]}>
                            Your collectible lands in your wallet as soon as you connect one.
                        </Text>
                    )}
                    <View style={styles.actions}>
                        {slug && <MeetShareActions slug={slug} meet={meet} viewerId={viewerId} place="sheet" />}
                        <EventCta label="View on profile" variant="ghost" onPress={viewOnProfile} />
                    </View>
                </>
            );
        }

        if (p && status === 'rejected' && role === 'photographer') {
            return (
                <>
                    {icon(<Camera size={28} color={colors.accent} />, colors.accent)}
                    <Text style={[styles.title, { color: main }]}>@{other} passed on this one</Text>
                    <Text style={[styles.text, { color: muted }]}>
                        {state.can_start ? 'You can retake it once more, or keep your Proof of Meet card as it is.'
                            : 'You both keep your Proof of Meet card as it is.'}
                    </Text>
                    {message && <Text style={styles.error}>{message}</Text>}
                    <View style={styles.actions}>
                        {state.can_start && <EventCta label="Retake once more" onPress={retake} busy={busy === 'retake'} />}
                        <EventCta label="Keep the card" variant={state.can_start ? 'ghost' : 'secondary'} onPress={close} />
                    </View>
                </>
            );
        }

        if (p && status === 'moderation_failed') {
            return (
                <>
                    {icon(<ShieldAlert size={28} color={colors.warning} />, colors.warning)}
                    <Text style={[styles.title, { color: main }]}>This photo can't be used — try another one</Text>
                    {message && <Text style={styles.error}>{message}</Text>}
                    <View style={styles.actions}>
                        {state.can_start && <EventCta label="Try another one" onPress={retake} busy={busy === 'retake'} />}
                        <EventCta label="Close" variant={state.can_start ? 'ghost' : 'secondary'} onPress={close} />
                    </View>
                </>
            );
        }

        if (p && status === 'expired') {
            return (
                <>
                    {icon(<Clock3 size={28} color={colors.accent} />, colors.accent)}
                    <Text style={[styles.title, { color: main }]}>
                        {role === 'photographer' ? `@${other} didn't answer in time` : 'This request expired'}
                    </Text>
                    <Text style={[styles.text, { color: muted }]}>You both keep your Proof of Meet card as it is.</Text>
                    <View style={styles.actions}><EventCta label="OK" variant="secondary" onPress={close} /></View>
                </>
            );
        }

        if (p && status === 'taken_down') {
            return (
                <>
                    {icon(<Check size={28} color={colors.accent} />, colors.accent)}
                    <Text style={[styles.title, { color: main }]}>The photo was removed</Text>
                    <Text style={[styles.text, { color: muted }]}>
                        The collectible stays in both wallets, but the photo is removed everywhere we control.
                    </Text>
                    <View style={styles.actions}><EventCta label="OK" variant="secondary" onPress={close} /></View>
                </>
            );
        }

        // Nothing to show for this meet (a draft on the other phone, or a photo you passed on)
        return (
            <>
                <Text style={[styles.title, { color: main }]}>
                    {state.taking && !state.taking.mine ? `@${state.taking.username} is taking the photo…` : 'No photo yet'}
                </Text>
                <View style={styles.actions}><EventCta label="OK" variant="secondary" onPress={close} /></View>
            </>
        );
    };

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
                closeMeetPhotoSheet();
            }}
        >
            <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
                {load.status === 'ready' ? renderBody(load.data) : load.status === 'missing' ? (
                    <>
                        <Text style={[styles.title, { color: main }]}>This photo isn't available</Text>
                        <View style={styles.actions}><EventCta label="Close" onPress={close} /></View>
                    </>
                ) : load.status === 'error' ? (
                    <>
                        <Text style={[styles.title, { color: main }]}>Couldn't load the photo</Text>
                        <Text style={[styles.text, { color: muted }]}>{load.error.message}</Text>
                        <View style={styles.actions}><EventCta label="Close" onPress={close} /></View>
                    </>
                ) : (
                    <View style={styles.loading}><CustomActivityIndicator size="small" /></View>
                )}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    content: {
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingTop: space.sm,
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.h2,
        lineHeight: typeScale.h2 + 4,
        textAlign: 'center',
        includeFontPadding: false,
    },
    text: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        lineHeight: typeScale.sub + 6,
        textAlign: 'center',
        marginTop: space.sm,
        includeFontPadding: false,
    },
    error: {
        color: colors.danger,
        fontFamily: 'Dank Mono',
        fontSize: typeScale.sub,
        textAlign: 'center',
        marginTop: space.sm,
        includeFontPadding: false,
    },
    preview: {
        marginTop: space.lg,
        marginBottom: space.sm,
        alignItems: 'center',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space.md,
    },
    inline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        marginTop: space.sm,
    },
    inlineText: {
        marginTop: 0,
    },
    row: {
        width: '100%',
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.lg,
    },
    flex: {
        flex: 1,
    },
    actions: {
        width: '100%',
        gap: space.sm,
        marginTop: space.lg,
    },
    loading: {
        paddingVertical: space.xxl,
    },
});
