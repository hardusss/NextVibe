import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import VerifyBadge from '../VerifyBadge';
import SeekerBadgeSheet, { SeekerBadgeSheetRef } from './SeekerBadgeSheet';

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
    /** Own profile only: adds "Share on X" / "Share image" to the sheet for this username */
    seekerShareUsername?: string | null;
    /** Opens the sheet by itself, with a "New" pill (first time after the badge was granted) */
    seekerIntro?: boolean;
    onSeekerIntroShown?: () => void;
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
    seekerShareUsername = null,
    seekerIntro = false,
    onSeekerIntroShown,
}: UserBadgesProps) {
    const sheetRef = useRef<SeekerBadgeSheetRef>(null);
    const [introOpen, setIntroOpen] = useState(false);
    const hasSheet = seekerVerified && seekerInfoOnTap;

    useEffect(() => {
        if (!seekerIntro || !hasSheet) return;
        // Let the screen finish arriving (push tap → profile) before sliding up
        const timer = setTimeout(() => {
            setIntroOpen(true);
            sheetRef.current?.present();
            onSeekerIntroShown?.();
        }, 450);
        return () => clearTimeout(timer);
    }, [seekerIntro, hasSheet, onSeekerIntroShown]);

    if (!official && !seekerVerified) return null;

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
            {hasSheet && (
                <SeekerBadgeSheet
                    ref={sheetRef}
                    source={seekerSource}
                    shareUsername={seekerShareUsername}
                    isNew={introOpen}
                    onDismiss={() => setIntroOpen(false)}
                />
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
});
