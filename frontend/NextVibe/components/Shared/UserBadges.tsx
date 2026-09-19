import React, { useRef } from 'react';
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
    /**
     * A SeekerBadgeSheet the screen renders itself (own profile). The badge tap
     * presents that one and no sheet is mounted here, so the screen can open it
     * from a push tap / deep link without waiting for this component.
     */
    seekerSheetRef?: React.RefObject<SeekerBadgeSheetRef | null>;
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
    seekerSheetRef,
}: UserBadgesProps) {
    const ownSheetRef = useRef<SeekerBadgeSheetRef>(null);
    const sheetRef = seekerSheetRef ?? ownSheetRef;
    const hasSheet = seekerVerified && seekerInfoOnTap && !seekerSheetRef;

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
