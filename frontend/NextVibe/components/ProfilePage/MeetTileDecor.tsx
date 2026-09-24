import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

/** Proof of Meet tiles stand out: the accent border, the two-circles glyph, the other person's avatar. */
export const MEET_ACCENT = "#8B5CF6";
/** Tiles at least this wide spell out "MEET" next to the glyph. */
export const MEET_LABEL_MIN_TILE = 120;

export interface MeetTilePerson {
    user_id: number;
    username: string;
    avatar: string | null;
}

export interface MeetTilePost {
    post_type?: string;
    owner?: MeetTilePerson | null;
    co_author?: MeetTilePerson | null;
}

/**
 * Who a Proof of Meet tile shows (the person the profile's owner met), or
 * undefined for any other post: those tiles stay as they are.
 */
export function meetTileOther(post: MeetTilePost, profileUserId: number): MeetTilePerson | null | undefined {
    if (post.post_type !== "proof_of_meet") return undefined;
    // On the co-author's profile the other person is the post's owner, and the other way round
    return (post.co_author?.user_id === profileUserId ? post.owner : post.co_author) ?? null;
}

/** Two overlapping circles: two people who met. */
function MeetGlyph({ withLabel }: { withLabel: boolean }) {
    return (
        <View style={styles.pill} pointerEvents="none" testID="meet-glyph">
            <View style={styles.circles}>
                <View style={styles.circle} />
                <View style={[styles.circle, styles.circleRight]} />
            </View>
            {withLabel && <Text style={styles.label}>MEET</Text>}
        </View>
    );
}

function MeetAvatar({ person }: { person: MeetTilePerson }) {
    return (
        <View style={styles.ring} pointerEvents="none" accessibilityLabel={`with @${person.username}`} testID="meet-avatar">
            {person.avatar ? (
                <Image source={{ uri: person.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
                <View style={[styles.avatar, styles.fallback]}>
                    <Text style={styles.initial}>{(person.username || "?").charAt(0).toUpperCase()}</Text>
                </View>
            )}
        </View>
    );
}

/** Drawn over a Proof of Meet tile in the profile grid (components/ProfilePage/PostsMenu.tsx). */
export default function MeetTileDecor({ other, tileSize }: { other: MeetTilePerson | null; tileSize: number }) {
    return (
        <>
            <MeetGlyph withLabel={tileSize >= MEET_LABEL_MIN_TILE} />
            {other && <MeetAvatar person={other} />}
            <View style={styles.border} pointerEvents="none" testID="meet-border" />
        </>
    );
}

const styles = StyleSheet.create({
    border: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: MEET_ACCENT,
    },
    pill: {
        position: "absolute",
        top: 6,
        right: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 5,
        height: 20,
        borderRadius: 10,
        backgroundColor: "rgba(10,4,16,0.62)",
    },
    circles: {
        width: 15,
        height: 10,
    },
    circle: {
        position: "absolute",
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: "#FFFFFF",
    },
    circleRight: {
        left: 5,
        borderColor: "#C4B5FD",
    },
    label: {
        color: "#FFFFFF",
        fontSize: 9,
        fontFamily: "Dank Mono Bold",
        letterSpacing: 0.6,
        includeFontPadding: false,
    },
    ring: {
        position: "absolute",
        left: 6,
        bottom: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#0A0410",
        alignItems: "center",
        justifyContent: "center",
    },
    avatar: {
        width: 18,
        height: 18,
        borderRadius: 9,
    },
    fallback: {
        backgroundColor: MEET_ACCENT,
        alignItems: "center",
        justifyContent: "center",
    },
    initial: {
        color: "#FFFFFF",
        fontSize: 10,
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false,
    },
});
