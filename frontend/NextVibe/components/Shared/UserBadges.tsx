import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import VerifyBadge from '../VerifyBadge';

interface UserBadgesProps {
    official?: boolean;
    seekerVerified?: boolean;
    size?: number;
    /** Pass-through props for the existing official-checkmark Lottie badge */
    isLooped?: boolean;
    isVisible?: boolean;
    haveModal?: boolean;
    isStatic?: boolean;
    /** Profile header only: long-press on the Seeker badge explains it */
    seekerInfoOnLongPress?: boolean;
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
    seekerInfoOnLongPress = false,
}: UserBadgesProps) {
    if (!official && !seekerVerified) return null;

    const seekerBadge = (
        <Image
            source={require('@/assets/badges/seeker-genesis.png')}
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 1,
                borderColor: 'rgba(168,85,247,0.6)',
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
                seekerInfoOnLongPress ? (
                    <Pressable
                        onLongPress={() =>
                            Alert.alert(
                                'Seeker Verified',
                                'This person owns a Solana Seeker (Genesis Token detected on-chain).'
                            )
                        }
                        hitSlop={8}
                    >
                        {seekerBadge}
                    </Pressable>
                ) : (
                    seekerBadge
                )
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
    },
});
