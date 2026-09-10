import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, useColorScheme } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import VerifyBadge from '../VerifyBadge';

const SEEKER_ART = require('@/assets/badges/seeker-genesis.png');

interface UserBadgesProps {
    official?: boolean;
    seekerVerified?: boolean;
    size?: number;
    /** Pass-through props for the existing official-checkmark Lottie badge */
    isLooped?: boolean;
    isVisible?: boolean;
    haveModal?: boolean;
    isStatic?: boolean;
    /** Profile header & NFC tap card only: tap on the Seeker badge opens the info sheet */
    seekerInfoOnTap?: boolean;
    /** Verification source from the API — 'skr' changes the sheet's source line */
    seekerSource?: string | null;
}

/**
 * Renders the official checkmark and the Seeker Verified badge together so
 * spacing and order stay consistent everywhere a username is shown.
 * Order: official checkmark first, then Seeker Genesis badge.
 */
export default function UserBadges({
    official = false,
    seekerVerified = false,
    size = 16,
    isLooped = false,
    isVisible = true,
    haveModal = false,
    isStatic = true,
    seekerInfoOnTap = false,
    seekerSource = null,
}: UserBadgesProps) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const isDark = useColorScheme() === 'dark';

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.6}
                pressBehavior="close"
            />
        ),
        []
    );

    if (!official && !seekerVerified) return null;

    const bg = isDark ? '#0A0410' : '#F5F3FF';
    const main = isDark ? '#FFFFFF' : '#111827';
    const muted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)';

    const seekerBadge = (
        <Image
            source={SEEKER_ART}
            style={{
                width: size,
                height: size,
                borderRadius: size * 0.28,
                overflow: 'hidden',
            }}
            contentFit="cover"
            accessibilityLabel="Seeker Verified"
        />
    );

    return (
        <View style={styles.row}>
            {official && (
                <VerifyBadge
                    isLooped={isLooped}
                    isVisible={isVisible}
                    haveModal={haveModal}
                    isStatic={isStatic}
                    size={size}
                />
            )}
            {seekerVerified && (
                seekerInfoOnTap ? (
                    <Pressable onPress={() => sheetRef.current?.present()} hitSlop={8}>
                        {seekerBadge}
                    </Pressable>
                ) : (
                    seekerBadge
                )
            )}
            {seekerVerified && seekerInfoOnTap && (
                <BottomSheetModal
                    ref={sheetRef}
                    enableDynamicSizing
                    backdropComponent={renderBackdrop}
                    backgroundStyle={{ backgroundColor: bg }}
                    handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
                >
                    <BottomSheetView style={styles.sheetContent}>
                        <Image source={SEEKER_ART} style={styles.sheetArt} contentFit="cover" />
                        <Text style={[styles.sheetTitle, { color: main }]}>Seeker Verified</Text>
                        <Text style={[styles.sheetLine, { color: muted }]}>
                            {seekerSource === 'skr'
                                ? 'This person owns a Solana Seeker. Verified via Seeker ID (.skr).'
                                : 'This person owns a Solana Seeker. Their Seeker Genesis Token was detected on-chain.'}
                        </Text>
                        <TouchableOpacity
                            style={styles.sheetCloseBtn}
                            activeOpacity={0.8}
                            onPress={() => sheetRef.current?.dismiss()}
                        >
                            <Text style={styles.sheetCloseTxt}>Close</Text>
                        </TouchableOpacity>
                    </BottomSheetView>
                </BottomSheetModal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        marginLeft: 4,
    },
    sheetContent: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 40,
    },
    sheetArt: {
        width: 48,
        height: 48,
        borderRadius: 48 * 0.28,
        overflow: 'hidden',
    },
    sheetTitle: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 18,
        marginTop: 12,
        includeFontPadding: false,
    },
    sheetLine: {
        fontFamily: 'Dank Mono',
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        marginTop: 6,
        includeFontPadding: false,
    },
    sheetCloseBtn: {
        alignSelf: 'stretch',
        alignItems: 'center',
        marginTop: 18,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#A855F7',
    },
    sheetCloseTxt: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 14,
        color: '#ffffff',
        includeFontPadding: false,
    },
});
