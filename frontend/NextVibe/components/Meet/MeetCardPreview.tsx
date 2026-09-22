import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Users } from 'lucide-react-native';
import ShimmerSkeleton from '@/components/Shared/motion/ShimmerSkeleton';
import { colors, radius } from '@/src/theme/tokens';

/** The story card is 1080×1350. */
export const MEET_CARD_ASPECT = 1350 / 1080;

type Props = {
    /** The ?v=story PNG: the image "Save image" saves. */
    uri: string | null;
    width: number;
    /** Shown while the card loads (the other person's avatar). */
    placeholderAvatar?: string | null;
    accessibilityLabel?: string;
};

/** The Proof of Meet card as it will be saved and shared, with a placeholder while it renders. */
export default function MeetCardPreview({ uri, width, placeholderAvatar, accessibilityLabel }: Props) {
    const isDark = useColorScheme() === 'dark';
    const height = Math.round(width * MEET_CARD_ASPECT);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => setLoaded(false), [uri]);

    return (
        <View
            style={[styles.frame, { width, height, borderColor: isDark ? 'rgba(168,85,247,0.28)' : 'rgba(124,58,237,0.2)' }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={accessibilityLabel ?? 'Proof of Meet card'}
        >
            {!loaded && (
                <>
                    <ShimmerSkeleton width={width} height={height} borderRadius={radius.lg} isDark={isDark} style={StyleSheet.absoluteFill} />
                    <View style={styles.center}>
                        {placeholderAvatar ? (
                            <Image source={{ uri: placeholderAvatar }} style={styles.avatar} contentFit="cover" />
                        ) : (
                            <View style={[styles.avatar, styles.avatarFallback]}>
                                <Users size={28} color={colors.accent} />
                            </View>
                        )}
                    </View>
                </>
            )}
            {uri && (
                <Image
                    source={{ uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={220}
                    cachePolicy="memory-disk"
                    onLoad={() => setLoaded(true)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        borderRadius: radius.lg,
        borderWidth: 1,
        overflow: 'hidden',
        backgroundColor: '#0B0714',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: 76,
        height: 76,
        borderRadius: 38,
        borderWidth: 3,
        borderColor: colors.accent,
    },
    avatarFallback: {
        backgroundColor: 'rgba(168,85,247,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
