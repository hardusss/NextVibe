import React, { useState } from "react";
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Entypo, MaterialIcons } from "@expo/vector-icons";
import { AvatarWithFrame } from "@/components/ProfilePage/AvatarWithFrame";
import VerifyBadge from "@/components/VerifyBadge";
import timeAgo from "@/src/utils/formatTime";

const REPLIES_BATCH = 3;
const TRUNCATE_AT = 200;

export interface User {
    username: string;
    avatar: string;
    official: boolean;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
}

export interface Reply {
    reply_id: number;
    user: User;
    user_id: number;
    content: string;
    create_at: string;
    count_likes: number;
}

export interface Comment {
    id: number;
    user: User;
    user_id: number;
    content: string;
    create_at: string;
    count_likes: number;
    replies: Reply[];
}

export interface LikedComments {
    comments: Record<number, boolean>;
    replies: Record<number, boolean>;
}

interface Theme {
    textPrimary: string;
    textSecondary: string;
    border: string;
    threadLine: string;
}


interface ReplyProps {
    item: Reply;
    isLiked: boolean;
    onLike: () => void;
    onReply: () => void;
    theme: Theme;
}

export const ReplyItem: React.FC<ReplyProps> = ({ item, isLiked, onLike, onReply, theme }) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = item.content.length > TRUNCATE_AT;

    return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <AvatarWithFrame
                avatarUrl={item.user.avatar}
                size={28}
                isOg={item.user.is_og}
                ogEdition={item.user.og_edition}
                invitedCount={item.user.invited_count}
            />
            <View style={{ flex: 1 }}>
                <View style={s.metaRow}>
                    <Text style={[s.username, { color: theme.textPrimary, fontSize: 13 }]}>
                        {item.user.username}
                    </Text>
                    {item.user.official && (
                        <VerifyBadge isLooped={false} isVisible haveModal={false} isStatic size={13} />
                    )}
                    <Text style={[s.time, { color: theme.textSecondary }]}>
                        · {timeAgo(item.create_at)}
                    </Text>
                </View>

                <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {isLong && !expanded ? `${item.content.slice(0, TRUNCATE_AT)}…` : item.content}
                </Text>
                {isLong && (
                    <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
                        <Text style={s.purple}>{expanded ? "Show less" : "Show more"}</Text>
                    </TouchableOpacity>
                )}

                <View style={s.actionsRow}>
                    <TouchableOpacity onPress={onReply} hitSlop={HIT}>
                        <Text style={[s.replyBtn, { color: theme.textSecondary }]}>Reply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onLike} hitSlop={HIT} style={s.likeRow}>
                        {item.count_likes > 0 && (
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                {item.count_likes}
                            </Text>
                        )}
                        <MaterialIcons
                            name={isLiked ? "favorite" : "favorite-border"}
                            size={14}
                            color={isLiked ? "#A855F7" : theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};


interface CommentProps {
    item: Comment;
    likedComments: LikedComments;
    onLike: (item: Comment | Reply) => void;
    onReply: (item: Comment | Reply) => void;
    theme: Theme;
    isLast: boolean;
}

/**
 * Replies are revealed in batches of {@link REPLIES_BATCH} to avoid rendering large threads
 * all at once. The thread line (left border) is only shown while at least one reply is visible,
 * visually connecting the avatar to its replies. `LayoutAnimation` makes expand/collapse smooth
 * without re-rendering the parent list.
 */
export const CommentItem: React.FC<CommentProps> = ({
    item, likedComments, onLike, onReply, theme, isLast,
}) => {
    const [textExpanded, setTextExpanded] = useState(false);
    const [visibleReplies, setVisibleReplies] = useState(0);

    const isLong = item.content.length > TRUNCATE_AT;
    const total = item.replies?.length ?? 0;
    const allShown = visibleReplies >= total;

    const expand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setVisibleReplies((v) => Math.min(total, v + REPLIES_BATCH));
    };

    const collapse = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setVisibleReplies(0);
    };

    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: isLast ? 14 : 0 }}>
            <View style={{ flexDirection: "row", gap: 11 }}>

                <View style={{ alignItems: "center", width: 36 }}>
                    <AvatarWithFrame
                        avatarUrl={item.user.avatar}
                        size={36}
                        isOg={item.user.is_og}
                        ogEdition={item.user.og_edition}
                        invitedCount={item.user.invited_count}
                    />
                    {visibleReplies > 0 && (
                        <View style={[s.threadLine, { backgroundColor: theme.threadLine }]} />
                    )}
                </View>

                <View style={{ flex: 1 }}>
                    <View style={[s.metaRow, { marginBottom: 3, flexWrap: "wrap" }]}>
                        <Text style={[s.username, { color: theme.textPrimary, fontSize: 14 }]}>
                            {item.user.username}
                        </Text>
                        {item.user.official && (
                            <VerifyBadge isLooped={false} isVisible haveModal={false} isStatic size={14} />
                        )}
                        <Text style={[s.time, { color: theme.textSecondary }]}>
                            · {timeAgo(item.create_at)}
                        </Text>
                    </View>

                    <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                        {isLong && !textExpanded
                            ? `${item.content.slice(0, TRUNCATE_AT)}…`
                            : item.content}
                    </Text>
                    {isLong && (
                        <TouchableOpacity onPress={() => setTextExpanded((e) => !e)}>
                            <Text style={s.purple}>{textExpanded ? "Show less" : "Show more"}</Text>
                        </TouchableOpacity>
                    )}

                    <View style={[s.actionsRow, { marginTop: 10 }]}>
                        <TouchableOpacity onPress={() => onReply(item)} hitSlop={HIT}>
                            <Text style={[s.replyBtn, { color: theme.textSecondary, fontSize: 13 }]}>
                                Reply
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onLike(item)}
                            hitSlop={HIT}
                            style={s.likeRow}
                        >
                            {item.count_likes > 0 && (
                                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                                    {item.count_likes}
                                </Text>
                            )}
                            <MaterialIcons
                                name={likedComments.comments[item.id] ? "favorite" : "favorite-border"}
                                size={16}
                                color={likedComments.comments[item.id] ? "#A855F7" : theme.textSecondary}
                            />
                        </TouchableOpacity>
                    </View>

                    {visibleReplies > 0 && (
                        <View>
                            {item.replies.slice(0, visibleReplies).map((r) => (
                                <ReplyItem
                                    key={r.reply_id}
                                    item={r}
                                    isLiked={!!likedComments.replies[r.reply_id]}
                                    onLike={() => onLike(r)}
                                    onReply={() => onReply(r)}
                                    theme={theme}
                                />
                            ))}
                        </View>
                    )}

                    {total > 0 && (
                        <View style={{ flexDirection: "row", gap: 16, marginTop: 10, marginBottom: 4 }}>
                            {!allShown && (
                                <TouchableOpacity onPress={expand} style={s.likeRow}>
                                    <Text style={[s.purple, { fontFamily: "Dank Mono Bold" }]}>
                                        {visibleReplies === 0
                                            ? `${total} ${total === 1 ? "reply" : "replies"}`
                                            : `${total - visibleReplies} more`}
                                    </Text>
                                    <Entypo name="chevron-down" size={13} color="#A855F7" />
                                </TouchableOpacity>
                            )}
                            {visibleReplies > 0 && (
                                <TouchableOpacity onPress={collapse} style={s.likeRow}>
                                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Hide</Text>
                                    <Entypo name="chevron-up" size={13} color={theme.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </View>

            {!isLast && (
                <View style={[s.separator, { backgroundColor: theme.border }]} />
            )}
        </View>
    );
};

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const s = StyleSheet.create({
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5
    },
    username: {
        fontFamily: "Dank Mono Bold",
        includeFontPadding: false
    },
    time: { fontSize: 12 },
    actionsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 18
    },
    replyBtn: {
        fontFamily: "Dank Mono Bold"
    },
    likeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    purple: {
        color: "#A855F7",
        fontSize: 13,
        marginTop: 3
    },
    threadLine: {
        flex: 1,
        width: 2,
        borderRadius: 1,
        marginTop: 6
    },
    separator: { height: 1, marginTop: 14, marginLeft: 47 },
});