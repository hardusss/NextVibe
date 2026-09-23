import React from 'react';
import { ScrollView, View, Text, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import { Sparkles, Users } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import UserBadges from '@/components/Shared/UserBadges';
import SuccessBurst from '@/components/NftClaim/MintBottomSheet/SuccessBurst';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useRepCountUp } from '@/hooks/useRepCountUp';
import { MOTION } from '@/constants/motion';
import MeetCardPreview, { MEET_CARD_ASPECT } from '@/components/Meet/MeetCardPreview';
import MeetShareActions from '@/components/Meet/MeetShareActions';
import MeetSelfieCta from '@/components/Meet/MeetSelfieCta';
import { useMeet } from '@/components/Meet/useMeet';
import type { MeetShareInfo } from '@/src/utils/meetShare';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

export type MeetUser = {
    user_id?: number;
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
    /** The Proof of Meet this tap made: its card, "Take a selfie together", Share on X and Save image. */
    meetSlug?: string | null;
    /** Where the tap happened, for the X post while the meet loads. */
    atEvent?: boolean;
};

/**
 * The shared "You met @user" reward moment for the tap-to-meet screens.
 * With a meet slug, the Proof of Meet card (the PNG "Save image" saves)
 * takes the avatar's place and the share buttons sit under the REP pill,
 * above the screen's own actions.
 * The caller fires the single success haptic; this component is visual only.
 */
export default function MeetSuccess({ user, points, actions, meetSlug = null, atEvent = false }: MeetSuccessProps) {
    const isDark = useColorScheme() === 'dark';
    const reduceMotion = useReduceMotion();
    const displayPoints = useRepCountUp(true, points);
    const { height: windowHeight } = useWindowDimensions();
    const [meetState] = useMeet(meetSlug);
    const meet = meetState.status === 'ready' ? meetState.meet : null;
    const showCard = !!meetSlug && meetState.status !== 'missing' && meetState.status !== 'error';
    // Small phones scroll; the card never gets tiny
    const cardWidth = Math.round(Math.max(150, Math.min(220, (windowHeight - 560) / MEET_CARD_ASPECT)));
    // The viewer is whichever of the two isn't the person they just met
    const viewerId = meet?.users.find((u) => (user?.user_id != null ? u.user_id !== user.user_id : u.username !== user?.username))?.user_id ?? null;
    const fallback: MeetShareInfo | undefined = meetSlug && user?.username
        ? { slug: meetSlug, other: user.username, atEvent, eventName: null, minted: false }
        : undefined;

    const main = isDark ? colors.text : '#111827';
    const mutedColor = isDark ? colors.sub : 'rgba(17,24,39,0.5)';
    const enter = (delay: number) =>
        reduceMotion ? undefined : FadeInDown.delay(delay).duration(MOTION.duration.normal);

    return (
        <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.springify().damping(15)}
            style={styles.fullScreenSuccess}
        >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
            <Animated.View entering={enter(100)}>
                <View style={styles.avatarWrap}>
                    {!reduceMotion && !showCard && <SuccessBurst trigger color={colors.accent} />}
                    {showCard ? (
                        <MeetCardPreview
                            uri={meet?.story_url ?? null}
                            width={cardWidth}
                            placeholderAvatar={user?.avatar ?? null}
                            accessibilityLabel={meet ? `${meet.title}. ${meet.when_line}. ${meet.history_line}.` : undefined}
                        />
                    ) : user?.avatar ? (
                        <Image source={{ uri: user.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                            <Users size={32} color={colors.accent} />
                        </View>
                    )}
                    {!reduceMotion && showCard && <SuccessBurst trigger color={colors.accent} />}
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
                style={[styles.actions, meetSlug ? styles.actionsWithShare : null]}
            >
                {meetSlug && <MeetSelfieCta slug={meetSlug} otherUsername={user?.username} />}
                {meetSlug && (
                    <MeetShareActions slug={meetSlug} meet={meet} fallback={fallback} viewerId={viewerId} place="tap" />
                )}
                {actions}
            </Animated.View>
            </ScrollView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    fullScreenSuccess: {
        flex: 1,
        width: '100%',
    },
    scroll: {
        flex: 1,
        width: '100%',
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: space.lg,
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
    actionsWithShare: {
        marginTop: space.xl,
        gap: space.sm,
    },
});
