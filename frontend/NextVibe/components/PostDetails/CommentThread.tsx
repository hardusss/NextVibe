import React, { useState } from "react";
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Heart, ChevronDown, ChevronUp } from "lucide-react-native";
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
    isHighlighted?: boolean;
}

export const ReplyItem: React.FC<ReplyProps> = ({ item, isLiked, onLike, onReply, theme, isHighlighted }) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = item.content.length > TRUNCATE_AT;

    const isDark = theme.textPrimary === "#E3E3E3";
    const highlightBg = isDark ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.08)";

    return (
        <View style={[
            { flexDirection: "row", gap: 10, marginTop: 14 },
            isHighlighted && {
                backgroundColor: highlightBg,
                borderRadius: 8,
                padding: 8,
                borderLeftWidth: 3,
                borderLeftColor: "#A855F7",
            }
        ]}>
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
                        <Heart
                            size={14}
                            color={isLiked ? "#A855F7" : theme.textSecondary}
                            fill={isLiked ? "#A855F7" : "transparent"}
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
    highlightedCommentId?: number | null;
    highlightedReplyId?: number | null;
}

/**
 * Replies are revealed in batches of {@link REPLIES_BATCH} to avoid rendering large threads
 * all at once. The thread line (left border) is only shown while at least one reply is visible,
 * visually connecting the avatar to its replies. `LayoutAnimation` makes expand/collapse smooth
 * without re-rendering the parent list.
 */
export const CommentItem: React.FC<CommentProps> = ({
    item, likedComments, onLike, onReply, theme, isLast,
    highlightedCommentId, highlightedReplyId,
}) => {
    const [textExpanded, setTextExpanded] = useState(false);
    const total = item.replies?.length ?? 0;

    const [visibleReplies, setVisibleReplies] = useState(() => {
        if (highlightedReplyId && item.replies) {
            const index = item.replies.findIndex(r => r.reply_id === Number(highlightedReplyId));
            if (index !== -1) {
                return Math.max(REPLIES_BATCH, index + 1);
            }
        }
        return 0;
    });

    const isLong = item.content.length > TRUNCATE_AT;
    const allShown = visibleReplies >= total;

    const expand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setVisibleReplies((v) => Math.min(total, v + REPLIES_BATCH));
    };

    const collapse = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setVisibleReplies(0);
    };

    const isHighlighted = highlightedCommentId ? item.id === Number(highlightedCommentId) : false;
    const isDark = theme.textPrimary === "#E3E3E3";
    const highlightBg = isDark ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.08)";

    return (
        <View style={[
            { paddingHorizontal: 16, paddingTop: 14, paddingBottom: isLast ? 14 : 0 },
            isHighlighted && {
                backgroundColor: highlightBg,
                borderRadius: 12,
                marginHorizontal: 8,
                paddingHorizontal: 8,
                borderLeftWidth: 3,
                borderLeftColor: "#A855F7",
            }
        ]}>
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
                            <Heart
                                size={16}
                                color={likedComments.comments[item.id] ? "#A855F7" : theme.textSecondary}
                                fill={likedComments.comments[item.id] ? "#A855F7" : "transparent"}
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
                                    isHighlighted={highlightedReplyId ? r.reply_id === Number(highlightedReplyId) : false}
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
                                    <ChevronDown size={13} color="#A855F7" />
                                </TouchableOpacity>
                            )}
                            {visibleReplies > 0 && (
                                <TouchableOpacity onPress={collapse} style={s.likeRow}>
                                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Hide</Text>
                                    <ChevronUp size={13} color={theme.textSecondary} />
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