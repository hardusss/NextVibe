import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSpring,
    cancelAnimation,
    interpolate,
    Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ImageIcon } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.52;
const CARD_HEIGHT = CARD_WIDTH * 1.22;

export interface HeroCardColors {
    accent: string;
    accentDim: string;
    text: string;
    sub: string;
    card: string;
    bg: string;
}

interface HeroCardProps {
    imageUrl: string | null;
    creatorUsername: string;
    creatorAvatar?: string | null;
    /** Edition number shown on the chip (upcoming edition, or minted one on success). */
    edition: number;
    total: number;
    /** True while the mint transaction is in flight — flips the card to its back. */
    flipped: boolean;
    /** True once the mint confirmed — flips back and counts the chip up. */
    success: boolean;
    reduceMotion: boolean;
    colors: HeroCardColors;
}

/**
 * The post media as a tilted collectible card: gradient border, soft glow,
 * slow idle float, and a flip to a shimmering back while minting.
 */
const HeroCard = ({
    imageUrl, creatorUsername, creatorAvatar, edition, total,
    flipped, success, reduceMotion, colors: c,
}: HeroCardProps) => {
    const float = useSharedValue(0);
    const flip = useSharedValue(0);
    const shimmer = useSharedValue(0);

    // Chip counts up to the final edition on success (#6 -> #7, 400ms).
    const [chipEdition, setChipEdition] = useState(edition);
    const countTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!success) { setChipEdition(edition); return; }
        if (reduceMotion || edition <= 1) { setChipEdition(edition); return; }
        let shown = edition - 1;
        setChipEdition(shown);
        countTimer.current = setInterval(() => {
            shown += 1;
            setChipEdition(shown);
            if (shown >= edition && countTimer.current) clearInterval(countTimer.current);
        }, 400);
        return () => { if (countTimer.current) clearInterval(countTimer.current); };
    }, [success, edition, reduceMotion]);

    useEffect(() => {
        if (reduceMotion) return;
        // 6s float loop: translateY ±4, rotateZ ±1°
        float.value = withRepeat(
            withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
        );
        return () => cancelAnimation(float);
    }, [reduceMotion]);

    useEffect(() => {
        flip.value = reduceMotion
            ? withTiming(flipped ? 1 : 0, { duration: 0 })
            : withSpring(flipped ? 1 : 0, { damping: 14, stiffness: 120 });
    }, [flipped, reduceMotion]);

    useEffect(() => {
        if (!flipped || reduceMotion) return;
        shimmer.value = 0;
        shimmer.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
        return () => cancelAnimation(shimmer);
    }, [flipped, reduceMotion]);

    const cardStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 900 },
            { translateY: interpolate(float.value, [0, 1], [-4, 4]) },
            { rotateZ: `${interpolate(float.value, [0, 1], [-1, 1])}deg` },
            { rotateY: `${8 + flip.value * 172}deg` },
        ],
    }));

    const backFaceStyle = useAnimatedStyle(() => ({
        opacity: flip.value > 0.5 ? 1 : 0,
    }));

    const frontFaceStyle = useAnimatedStyle(() => ({
        opacity: flip.value > 0.5 ? 0 : 1,
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-CARD_WIDTH, CARD_WIDTH]) }],
    }));

    return (
        <View style={styles.wrap}>
            {/* Glow */}
            <View style={[styles.glow, { backgroundColor: 'rgba(168,85,247,0.35)' }]} />

            <Reanimated.View style={[styles.card, cardStyle]}>
                {/* Front */}
                <Reanimated.View style={[StyleSheet.absoluteFillObject, frontFaceStyle]}>
                    <LinearGradient
                        colors={[c.accent, 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.borderGradient}
                    >
                        <View style={[styles.face, { backgroundColor: c.card }]}>
                            {imageUrl ? (
                                <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                            ) : (
                                <View style={[StyleSheet.absoluteFillObject, styles.placeholder, { backgroundColor: c.accentDim }]}>
                                    <ImageIcon size={36} color={c.accent} />
                                </View>
                            )}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.65)']}
                                style={styles.overlayGradient}
                            />
                            <View style={styles.overlayRow}>
                                <View style={styles.authorRow}>
                                    {creatorAvatar ? (
                                        <Image source={{ uri: creatorAvatar }} style={styles.avatar} contentFit="cover" />
                                    ) : (
                                        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.accent }]}>
                                            <Text style={styles.avatarInitial}>{creatorUsername?.[0]?.toUpperCase() ?? '?'}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.username} numberOfLines={1}>@{creatorUsername}</Text>
                                </View>
                                <View style={styles.editionChip}>
                                    <Text style={styles.editionChipText}>#{chipEdition} / {total}</Text>
                                </View>
                            </View>
                        </View>
                    </LinearGradient>
                </Reanimated.View>

                {/* Back — shown while minting */}
                <Reanimated.View style={[StyleSheet.absoluteFillObject, styles.backFlip, backFaceStyle]}>
                    <LinearGradient
                        colors={[c.accent, 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.borderGradient}
                    >
                        <View style={[styles.face, styles.backFace, { backgroundColor: '#160726' }]}>
                            <Reanimated.View style={[StyleSheet.absoluteFillObject, shimmerStyle]}>
                                <LinearGradient
                                    colors={['transparent', 'rgba(168,85,247,0.25)', 'transparent']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFillObject}
                                />
                            </Reanimated.View>
                            <Text style={[styles.backMark, { color: c.accent }]}>NextVibe</Text>
                            <Text style={styles.backLabel}>Minting on Solana…</Text>
                        </View>
                    </LinearGradient>
                </Reanimated.View>
            </Reanimated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    glow: {
        position: 'absolute',
        width: CARD_WIDTH * 1.05,
        height: CARD_HEIGHT * 0.9,
        borderRadius: 40,
        opacity: 0.55,
        transform: [{ scale: 1.08 }],
    },
    card: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
    },
    backFlip: {
        transform: [{ rotateY: '180deg' }],
    },
    borderGradient: {
        flex: 1,
        borderRadius: 22,
        padding: 1,
    },
    face: {
        flex: 1,
        borderRadius: 21,
        overflow: 'hidden',
    },
    placeholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayGradient: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: 70,
    },
    overlayRow: {
        position: 'absolute',
        left: 10, right: 10, bottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    avatar: { width: 22, height: 22, borderRadius: 11 },
    avatarFallback: { justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { color: 'white', fontSize: 12, fontFamily: 'Dank Mono Bold', includeFontPadding: false },
    username: {
        color: 'white',
        fontSize: 12,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        flexShrink: 1,
    },
    editionChip: {
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.5)',
    },
    editionChipText: {
        color: '#d8b4fe',
        fontSize: 11,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
    },
    backFace: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    backMark: {
        fontSize: 22,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 1,
    },
    backLabel: {
        color: '#8b7aab',
        fontSize: 12,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
    },
});

export default HeroCard;
