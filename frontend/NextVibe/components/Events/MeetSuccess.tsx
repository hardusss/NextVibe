import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Sparkles, Users } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import UserBadges from '@/components/Shared/UserBadges';
import SuccessBurst from '@/components/NftClaim/MintBottomSheet/SuccessBurst';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useRepCountUp } from '@/hooks/useRepCountUp';
import { MOTION } from '@/constants/motion';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

export type MeetUser = {
    username?: string;
    avatar?: string | null;
    is_official?: boolean;
    is_seeker_verified?: boolean;
};

type MeetSuccessProps = {
    user: MeetUser | null;
    points: number;
    /** CTA block rendered under the reward — screens own their own actions. */
    actions: React.ReactNode;
};

/**
 * The shared "You met @user" reward moment for the tap-to-meet screens.
 * The caller fires the single success haptic; this component is visual only.
 */
export default function MeetSuccess({ user, points, actions }: MeetSuccessProps) {
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const displayPoints = useRepCountUp(true, points);

    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';
    const enter = (delay: number) =>
        reduceMotion ? undefined : FadeInDown.delay(delay).duration(MOTION.duration.normal);

    return (
        <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
            style={styles.fullScreenSuccess}
        >
            <Animated.View entering={enter(100)}>
                <View style={styles.avatarWrap}>
                    {!reduceMotion && <SuccessBurst trigger color={colors.accent} />}
                    {user?.avatar ? (
                        <Image source={{ uri: user.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                            <Users size={32} color={colors.accent} />
                        </View>
                    )}
                </View>
            </Animated.View>

            <Animated.View entering={enter(220)} style={styles.nameRow}>
                <Text style={[styles.heading, { color: main }]} numberOfLines={1}>
                    You met @{user?.username}
                </Text>
                <UserBadges
                    official={user?.is_official}
                    seekerVerified={user?.is_seeker_verified}
                    size={22}
                    seekerInfoOnTap={true}
                />
            </Animated.View>

            <Animated.View entering={enter(340)} style={styles.repBadgeGlow}>
                <LinearGradient
                    colors={[colors.accent, colors.accentDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.repBadge}
                >
                    <Sparkles size={22} color="#ffffff" strokeWidth={2} />
                    <Text style={styles.repPointsText}>+{displayPoints} REP</Text>
                </LinearGradient>
            </Animated.View>

            <Animated.Text entering={enter(460)} style={[styles.subtitle, { color: mutedColor }]}>
                Reputation added for both of you!
            </Animated.Text>

            <Animated.View
                entering={reduceMotion ? undefined : FadeInUp.delay(600).duration(MOTION.duration.normal)}
                style={styles.actions}
            >
                {actions}
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    fullScreenSuccess: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: space.xxl + space.sm,
    },
    avatarWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: colors.accent,
    },
    avatarFallback: {
        backgroundColor: 'rgba(168,85,247,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: space.lg,
    },
    heading: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.title,
        lineHeight: typeScale.title + 2,
        includeFontPadding: false,
        textAlign: 'center',
        flexShrink: 1,
    },
    repBadgeGlow: {
        marginTop: space.xl - space.xs,
        borderRadius: radius.pill,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 10,
    },
    repBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm + 2,
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
        borderRadius: radius.pill,
    },
    repPointsText: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 26,
        color: '#ffffff',
        includeFontPadding: false,
    },
    subtitle: {
        fontFamily: 'Dank Mono',
        fontSize: typeScale.body,
        marginTop: space.lg,
        textAlign: 'center',
        includeFontPadding: false,
    },
    actions: {
        width: '100%',
        paddingHorizontal: space.xxl + space.sm,
        marginTop: space.xxl + space.sm,
        gap: space.md,
    },
});
