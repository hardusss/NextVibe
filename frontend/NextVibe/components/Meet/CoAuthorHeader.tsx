import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Users } from 'lucide-react-native';
import UserBadges from '@/components/Shared/UserBadges';
import { colors } from '@/src/theme/tokens';

export interface CoAuthorPerson {
    user_id: number;
    username: string;
    avatar: string | null;
    seeker_verified?: boolean;
    official?: boolean;
}

/** The API marks a Proof of Meet post with post_type "proof_of_meet" and its co_author. */
export function isProofOfMeetPost(post: { post_type?: string | null; co_author?: unknown } | null | undefined): boolean {
    return !!post && post.post_type === 'proof_of_meet' && !!post.co_author;
}

function Face({ uri, size, style }: { uri: string | null; size: number; style?: object }) {
    const box = { width: size, height: size, borderRadius: size / 2 };
    return uri ? (
        <Image source={{ uri }} style={[box, styles.face, style]} contentFit="cover" />
    ) : (
        <View style={[box, styles.face, styles.fallback, style]}>
            <Users size={size * 0.45} color={colors.accent} />
        </View>
    );
}

/** Both people of a Proof of Meet post, overlapping like on the card. */
export function CoAuthorAvatars({ owner, coAuthor, size = 40 }: { owner: CoAuthorPerson; coAuthor: CoAuthorPerson; size?: number }) {
    const small = Math.round(size * 0.82);
    return (
        <View style={{ width: size + small * 0.62, height: size }} accessible accessibilityLabel={`@${owner.username} and @${coAuthor.username}`}>
            <Face uri={coAuthor.avatar} size={small} style={{ position: 'absolute', right: 0, top: (size - small) / 2 }} />
            <Face uri={owner.avatar} size={size} />
        </View>
    );
}

type NameProps = {
    owner: CoAuthorPerson;
    coAuthor: CoAuthorPerson;
    onPressUser: (userId: number) => void;
    textStyle: object;
    mutedColor: string;
    isVisible?: boolean;
};

/** "@owner with @co_author": each name opens that profile. */
export function CoAuthorNames({ owner, coAuthor, onPressUser, textStyle, mutedColor, isVisible = true }: NameProps) {
    return (
        <View style={styles.names}>
            <TouchableOpacity style={styles.name} hitSlop={{ top: 12, bottom: 12 }} onPress={() => onPressUser(owner.user_id)}>
                <Text style={[textStyle, styles.shrink]} numberOfLines={1}>{owner.username}</Text>
                <UserBadges official={owner.official} seekerVerified={owner.seeker_verified} isLooped isVisible={isVisible}
                    haveModal={false} isStatic={false} size={14} />
            </TouchableOpacity>
            <Text style={[textStyle, styles.with, { color: mutedColor }]}>with</Text>
            <TouchableOpacity style={styles.name} hitSlop={{ top: 12, bottom: 12 }} onPress={() => onPressUser(coAuthor.user_id)}>
                <Text style={[textStyle, styles.shrink]} numberOfLines={1}>{coAuthor.username}</Text>
                <UserBadges official={coAuthor.official} seekerVerified={coAuthor.seeker_verified} isLooped isVisible={isVisible}
                    haveModal={false} isStatic={false} size={14} />
            </TouchableOpacity>
        </View>
    );
}

/** The small "Proof of Meet" label under the names. */
export function ProofOfMeetLabel({ color }: { color?: string }) {
    return <Text style={[styles.label, { color: color ?? '#2DD4BF' }]}>Proof of Meet</Text>;
}

const styles = StyleSheet.create({
    face: {
        borderWidth: 2,
        borderColor: '#0B0714',
        backgroundColor: '#160F26',
    },
    fallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    names: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        minWidth: 0,
    },
    name: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        minWidth: 0,
    },
    shrink: {
        flexShrink: 1,
    },
    with: {
        fontFamily: 'Dank Mono',
        marginHorizontal: 5,
    },
    label: {
        fontFamily: 'Dank Mono Bold',
        fontSize: 11,
        letterSpacing: 0.4,
        marginTop: 2,
        includeFontPadding: false,
    },
});
