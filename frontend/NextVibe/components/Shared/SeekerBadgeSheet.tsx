import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { Share as ShareIcon } from 'lucide-react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import haptics from '@/src/utils/haptics';
import { track } from '@/src/utils/analytics';
import { seekerShareIntentUrl } from '@/src/utils/seekerShare';
import { canShareSeekerImage, shareSeekerCard, warmSeekerCard } from '@/src/utils/seekerCardShare';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import XLogo from '@/components/Shared/XLogo';
import { space, radius } from '@/src/theme/tokens';

const SEEKER_ART = require('@/assets/badges/seeker-genesis.png');
const ACCENT = '#A855F7';

export interface SeekerBadgeSheetRef {
    present: () => void;
    dismiss: () => void;
}

interface Props {
    /** Verification source from the API — 'skr' changes the copy. */
    source?: string | null;
    /** Own profile only: adds "Share on X" and "Share image" for this username. */
    shareUsername?: string | null;
    /** First open after the badge was granted: shows the "New" pill. */
    isNew?: boolean;
    onDismiss?: () => void;
}

function infoLine(isOwn: boolean, source?: string | null): string {
    if (source === 'skr') {
        return isOwn
            ? 'You own a Solana Seeker. Verified via Seeker ID (.skr).'
            : 'This person owns a Solana Seeker. Verified via Seeker ID (.skr).';
    }
    return isOwn
        ? 'You own a Solana Seeker. Your Seeker Genesis Token was detected on-chain.'
        : 'This person owns a Solana Seeker. Their Seeker Genesis Token was detected on-chain.';
}

/**
 * iOS: present above everything, including native-stack modals. Same fix as
 * the tap prompt (2026-09-15): UIKit won't show a sheet from the root view
 * while a modal screen is up. The overlay is a separate native window, so it
 * needs its own gesture root for pan-to-close.
 */
const IosOverlayContainer = ({ children }: React.PropsWithChildren) => (
    <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
);
const containerComponent = Platform.OS === 'ios' ? IosOverlayContainer : undefined;

/** The sheet behind the Seeker Verified badge (profile header, tap card). */
const SeekerBadgeSheet = forwardRef<SeekerBadgeSheetRef, Props>(
    ({ source = null, shareUsername = null, isNew = false, onDismiss }, ref) => {
        const sheetRef = useRef<BottomSheetModal>(null);
        const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
        const isDark = useColorScheme() === 'dark';
        const [open, setOpen] = useState(false);
        const [busy, setBusy] = useState<'x' | 'image' | null>(null);
        const [error, setError] = useState<string | null>(null);

        const isOwn = !!shareUsername;
        const showImageShare = isOwn && canShareSeekerImage();

        // present() before the modal's own ref exists is remembered, not dropped.
        const presentPending = useRef(false);

        useImperativeHandle(ref, () => ({
            present: () => {
                if (sheetRef.current) sheetRef.current.present();
                else presentPending.current = true;
            },
            dismiss: () => {
                presentPending.current = false;
                sheetRef.current?.dismiss();
            },
        }), []);

        useEffect(() => {
            if (presentPending.current && sheetRef.current) {
                presentPending.current = false;
                sheetRef.current.present();
            }
        });

        useEffect(() => () => {
            if (busyTimer.current) clearTimeout(busyTimer.current);
        }, []);

        const close = useCallback(() => sheetRef.current?.dismiss(), []);
        useSheetBackHandler(open, close);

        const handleChange = useCallback((index: number) => {
            setOpen(index >= 0);
            if (index >= 0 && shareUsername) warmSeekerCard(shareUsername);
        }, [shareUsername]);

        const handleDismiss = useCallback(() => {
            setOpen(false);
            setError(null);
            onDismiss?.();
        }, [onDismiss]);

        const renderBackdrop = useCallback(
            (props: BottomSheetBackdropProps) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={0.6}
                    // On iOS the tap that closes the system share sheet can land here
                    pressBehavior={busy ? 'none' : 'close'}
                />
            ),
            [busy]
        );

        // Keep ignoring taps for a beat after X / the share sheet takes over
        const releaseBusy = () => {
            if (busyTimer.current) clearTimeout(busyTimer.current);
            busyTimer.current = setTimeout(() => setBusy(null), 400);
        };

        const handleShareX = async () => {
            if (!shareUsername || busy) return;
            haptics.impact('light');
            setBusy('x');
            setError(null);
            try {
                await Linking.openURL(seekerShareIntentUrl(shareUsername, source));
                track('seeker_share_x_opened', { source: source ?? 'onchain', first_grant: isNew });
            } catch {
                haptics.notification('error');
                setError("Couldn't open X. Try again.");
            } finally {
                releaseBusy();
            }
        };

        const handleShareImage = async () => {
            if (!shareUsername || busy) return;
            haptics.impact('light');
            setBusy('image');
            setError(null);
            try {
                await shareSeekerCard(shareUsername);
                track('seeker_share_image', { source: source ?? 'onchain', first_grant: isNew });
            } catch {
                haptics.notification('error');
                setError("Couldn't load your card. Try again.");
            } finally {
                releaseBusy();
            }
        };

        const bg = isDark ? '#0A0410' : '#F5F3FF';
        const main = isDark ? '#FFFFFF' : '#111827';
        const muted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)';
        const accentText = isDark ? '#E9D5FF' : '#6D28D9';

        return (
            <BottomSheetModal
                ref={sheetRef}
                containerComponent={containerComponent}
                enableDynamicSizing
                enablePanDownToClose={!busy}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: bg }}
                handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
                onChange={handleChange}
                onDismiss={handleDismiss}
            >
                <BottomSheetView style={styles.content}>
                    {isNew && (
                        <View
                            style={[styles.newPill, {
                                backgroundColor: isDark ? 'rgba(168,85,247,0.18)' : 'rgba(124,58,237,0.10)',
                                borderColor: isDark ? 'rgba(168,85,247,0.45)' : 'rgba(124,58,237,0.30)',
                            }]}
                        >
                            <Text style={[styles.newPillText, { color: accentText }]}>New</Text>
                        </View>
                    )}
                    <Image source={SEEKER_ART} style={styles.art} contentFit="cover" />
                    <Text style={[styles.title, { color: main }]}>Seeker Verified</Text>
                    <Text style={[styles.line, { color: muted }]}>{infoLine(isOwn, source)}</Text>

                    {isOwn ? (
                        <>
                            <TouchableOpacity
                                style={[styles.primaryBtn, styles.shareBtn]}
                                activeOpacity={0.85}
                                onPress={handleShareX}
                                accessibilityRole="button"
                                accessibilityLabel="Share on X"
                            >
                                <XLogo size={16} color="#FFFFFF" />
                                <Text style={styles.primaryText}>Share on X</Text>
                            </TouchableOpacity>
                            {showImageShare && (
                                <TouchableOpacity
                                    style={[styles.secondaryBtn, {
                                        backgroundColor: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(124,58,237,0.08)',
                                        borderColor: isDark ? 'rgba(168,85,247,0.35)' : 'rgba(124,58,237,0.25)',
                                    }]}
                                    activeOpacity={0.85}
                                    onPress={handleShareImage}
                                    accessibilityRole="button"
                                    accessibilityLabel="Share image"
                                    accessibilityState={{ busy: busy === 'image' }}
                                >
                                    {busy === 'image' ? (
                                        <ActivityIndicator size="small" color={accentText} />
                                    ) : (
                                        <ShareIcon size={17} color={accentText} />
                                    )}
                                    <Text style={[styles.secondaryText, { color: accentText }]}>Share image</Text>
                                </TouchableOpacity>
                            )}
                            {error && <Text style={styles.errorText}>{error}</Text>}
                            <TouchableOpacity style={styles.closeLink} onPress={close} hitSlop={8} accessibilityRole="button">
                                <Text style={[styles.closeLinkText, { color: muted }]}>Close</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8} onPress={close}>
                            <Text style={styles.primaryText}>Close</Text>
                        </TouchableOpacity>
                    )}
                </BottomSheetView>
            </BottomSheetModal>
        );
    }
);

SeekerBadgeSheet.displayName = 'SeekerBadgeSheet';

export default SeekerBadgeSheet;

const styles = StyleSheet.create({
    content: {
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingTop: space.sm,
        paddingBottom: 40,
    },
    newPill: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        marginBottom: space.md,
    },
    newPillText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        includeFontPadding: false,
    },
    art: {
        width: 48,
        height: 48,
        borderRadius: 48 * 0.28,
        overflow: 'hidden',
    },
    title: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        marginTop: space.md,
        includeFontPadding: false,
    },
    line: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        marginTop: 6,
        includeFontPadding: false,
    },
    primaryBtn: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        marginTop: 18,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: ACCENT,
    },
    shareBtn: {
        minHeight: 48,
    },
    primaryText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        color: '#FFFFFF',
        includeFontPadding: false,
    },
    secondaryBtn: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        minHeight: 48,
        marginTop: space.sm,
        borderRadius: 12,
        borderWidth: 1,
    },
    secondaryText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        includeFontPadding: false,
    },
    errorText: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        color: '#f87171',
        textAlign: 'center',
        marginTop: space.md,
        includeFontPadding: false,
    },
    closeLink: {
        marginTop: space.lg,
        paddingVertical: space.xs,
    },
    closeLinkText: {
        fontFamily: 'Dank Mono',
        fontSize: 14,
        includeFontPadding: false,
    },
});
