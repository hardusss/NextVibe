import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    FlatList,
    StyleSheet,
    Dimensions,
    Platform,
    UIManager,
    LayoutAnimation,
    KeyboardAvoidingView,
    Modal,
    Animated,
    StatusBar,
    useColorScheme,
} from 'react-native';
import getComments from '@/src/api/get.comments';
import { Heart, ChevronDown, ChevronUp, X, MessageSquareOff, MessageSquare, ArrowUp } from 'lucide-react-native';
import timeAgo from '@/src/utils/formatTime';
import { ActivityIndicator } from '../CustomActivityIndicator';
import getUserDetail from '@/src/api/user.detail';
import createComment from '@/src/api/create.comment';
import createCommentReply from '@/src/api/comment.reply';
import commentLike from '@/src/api/comment.like';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import VerifyBadge from '../VerifyBadge';
import { AvatarWithFrame } from '@/components/ProfilePage/AvatarWithFrame';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REPLIES_BATCH_SIZE = 3;

interface User {
    username: string;
    avatar: string;
    official: boolean;
    is_og: boolean;
    og_edition: number | null;
    invited_count: number;
}

interface BaseComment {
    user: User;
    user_id: number;
    content: string;
    create_at: string;
    count_likes: number;
}

interface Reply extends BaseComment {
    reply_id: number;
}

interface Comment extends BaseComment {
    id: number;
    replies: Reply[];
}

interface UserData {
    username: string;
    about: string;
    avatar: string | null;
    post_count: number;
    readers_count: number;
    follows_count: number;
    official: boolean;
    liked_comments: number[];
    liked_comment_replies: number[];
}

interface PopupModalProps {
    post_id: number;
    isCommentsEnabled?: boolean;
    onClose: () => void;
    isFocused?: boolean;
}

const PopupModal = ({ post_id, isCommentsEnabled = true, onClose, isFocused }: PopupModalProps) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
    const colors = isDark ? themeColors.dark : themeColors.light;
    const styles = useMemo(() => getStyles(colors), [colors]);

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const [comments, setComments] = useState<Comment[]>([]);
    const [expandedComments, setExpandedComments] = useState<{ [key: number]: number }>({});
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<UserData>();
    const [owner, setOwner] = useState<string | null>(null);
    const [likedComments, setLikedComments] = useState<{
        comments: { [key: number]: boolean };
        replies: { [key: number]: boolean };
    }>({ comments: {}, replies: {} });
    const [replyingTo, setReplyingTo] = useState<Comment | Reply | null>(null);
    const [commentText, setCommentText] = useState('');
    const [expandedTexts, setExpandedTexts] = useState<{ [key: string]: boolean }>({});

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: 0,
            tension: 65,
            friction: 11,
            useNativeDriver: true,
        }).start();
    }, []);

    useEffect(() => {
        const getData = async () => {
            try {
                const data = await getComments(post_id);
                if (data && typeof data === 'object' && Array.isArray(data.comments)) {
                    setOwner(data.author ?? null);
                    setComments(data.comments);
                } else {
                    setComments([]);
                }
            } catch {
                setComments([]);
            } finally {
                setLoading(false);
            }
        };

        const getUser = async () => {
            const u = await getUserDetail();
            setUser(u);
            setLikedComments({
                comments: u.liked_comments.reduce(
                    (acc: any, id: number) => ({ ...acc, [id]: true }), {}
                ),
                replies: u.liked_comment_replies.reduce(
                    (acc: any, id: number) => ({ ...acc, [id]: true }), {}
                ),
            });
        };

        getUser();
        getData();
    }, [post_id]);

    const handleClose = () => {
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 260,
            useNativeDriver: true,
        }).start(() => onClose());
    };

    const isLiked = (item: Comment | Reply): boolean => {
        if ('reply_id' in item) return likedComments.replies[item.reply_id] || false;
        return likedComments.comments[item.id] || false;
    };

    const toggleLike = async (item: Comment | Reply) => {
        await commentLike('reply_id' in item ? item.reply_id : item.id, 'reply_id' in item);
        const isCurrentlyLiked = isLiked(item);

        setLikedComments(prev => {
            if ('reply_id' in item) {
                return { ...prev, replies: { ...prev.replies, [item.reply_id]: !prev.replies[item.reply_id] } };
            }
            return { ...prev, comments: { ...prev.comments, [item.id]: !prev.comments[item.id] } };
        });

        setComments(prev =>
            prev.map(comment => {
                if ('reply_id' in item) {
                    if (comment.replies.some(r => r.reply_id === item.reply_id)) {
                        return {
                            ...comment,
                            replies: comment.replies.map(r =>
                                r.reply_id === item.reply_id
                                    ? { ...r, count_likes: r.count_likes + (isCurrentlyLiked ? -1 : 1) }
                                    : r
                            ),
                        };
                    }
                } else if (comment.id === item.id) {
                    return { ...comment, count_likes: comment.count_likes + (isCurrentlyLiked ? -1 : 1) };
                }
                return comment;
            })
        );
    };

    const showMoreReplies = (commentId: number, totalReplies: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedComments(prev => ({
            ...prev,
            [commentId]: Math.min(totalReplies, (prev[commentId] || 0) + REPLIES_BATCH_SIZE),
        }));
    };

    const hideReplies = (commentId: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedComments(prev => ({ ...prev, [commentId]: 0 }));
    };

    const findParentComment = (replyId: number): Comment | null => {
        for (const comment of comments) {
            if (comment.replies.some(r => r.reply_id === replyId)) return comment;
        }
        return null;
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !isCommentsEnabled) return;

        if (replyingTo === null) {
            const response = await createComment(commentText, post_id);
            setCommentText('');
            setComments(prev => [response, ...prev]);
        } else {
            const commentId =
                'id' in replyingTo
                    ? replyingTo.id
                    : (findParentComment(replyingTo.reply_id)?.id || replyingTo.reply_id);

            const response = await createCommentReply(commentText, commentId);
            if (response) {
                let newTotal = 0;
                setComments(prev =>
                    prev.map(c => {
                        if (c.id === commentId) {
                            const updated = [...(c.replies || []), response];
                            newTotal = updated.length;
                            return { ...c, replies: updated };
                        }
                        return c;
                    })
                );
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedComments(prev => ({ ...prev, [commentId]: newTotal }));
            }
            setCommentText('');
            setReplyingTo(null);
        }
    };

    const toggleText = (id: string) => {
        setExpandedTexts(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const renderCommentText = (text: string, id: string) => {
        if (text.length <= 200 || expandedTexts[id]) {
            return <Text style={styles.commentText}>{text}</Text>;
        }
        return (
            <View>
                <Text style={styles.commentText}>{text.slice(0, 200)}...</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => toggleText(id)}>
                    <Text style={styles.showMoreText}>Show more</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderReply = ({ item }: { item: Reply }) => (
        <View style={styles.replyContainer}>
            <View style={styles.userInfo}>
                <AvatarWithFrame
                    avatarUrl={item.user.avatar}
                    size={32}
                    isOg={item.user.is_og}
                    ogEdition={item.user.og_edition}
                    invitedCount={item.user.invited_count}
                />
                <View style={styles.commentContent}>
                    <View style={styles.userDetails}>
                        <Text style={styles.username}>{item.user?.username}</Text>
                        {item.user?.official && (
                            <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={14} />
                        )}
                    </View>
                    {renderCommentText(item.content, `reply-${item.reply_id}`)}
                    <View style={styles.commentFooter}>
                        <View style={styles.commentFooterLeft}>
                            <Text style={styles.timeText}>{timeAgo(item.create_at)}</Text>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setReplyingTo(item)}>
                                <Text style={styles.replyBtn}>Reply</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => toggleLike(item)}>
                            <View style={styles.likeRow}>
                                {item.count_likes > 0 && <Text style={styles.likeCount}>{item.count_likes}</Text>}
                                <Heart size={16} color={isLiked(item) ? '#A855F7' : '#666'} fill={isLiked(item) ? '#A855F7' : 'transparent'} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );

    const renderComment = ({ item }: { item: Comment }) => {
        const visibleCount = expandedComments[item.id] || 0;
        const totalReplies = item.replies?.length || 0;
        const allShown = visibleCount === totalReplies;

        return (
            <View style={styles.commentContainer}>
                <View style={styles.userInfo}>
                    <AvatarWithFrame
                        avatarUrl={item.user.avatar}
                        size={36}
                        isOg={item.user.is_og}
                        ogEdition={item.user.og_edition}
                        invitedCount={item.user.invited_count}
                    />
                    <View style={styles.commentContent}>
                        <View style={styles.userDetails}>
                            <Text style={styles.username}>{item.user?.username}</Text>
                            {item.user?.official && (
                                <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={14} />
                            )}
                        </View>
                        {renderCommentText(item.content, `comment-${item.id}`)}
                        <View style={styles.commentFooter}>
                            <View style={styles.commentFooterLeft}>
                                <Text style={styles.timeText}>{timeAgo(item.create_at)}</Text>
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setReplyingTo(item)}>
                                    <Text style={styles.replyBtn}>Reply</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => toggleLike(item)}>
                                <View style={styles.likeRow}>
                                    {item.count_likes > 0 && <Text style={styles.likeCount}>{item.count_likes}</Text>}
                                    <Heart size={16} color={isLiked(item) ? '#A855F7' : '#666'} fill={isLiked(item) ? '#A855F7' : 'transparent'} />
                                </View>
                            </TouchableOpacity>
                        </View>

                        {visibleCount > 0 && item.replies && (
                            <FlatList
                                data={item.replies.slice(0, visibleCount)}
                                renderItem={renderReply}
                                keyExtractor={r => r.reply_id.toString()}
                                scrollEnabled={false}
                                nestedScrollEnabled={true}
                            />
                        )}

                        {totalReplies > 0 && (
                            <View style={styles.repliesButtonContainer}>
                                 {!allShown && (
                                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => showMoreReplies(item.id, totalReplies)} style={styles.replyToggleBtn}>
                                        <Text style={styles.toggleRepliesText}>
                                            {visibleCount === 0 ? `View replies: ${totalReplies}` : `View ${totalReplies - visibleCount} more`}
                                        </Text>
                                        <ChevronDown size={12} color="#888" />
                                    </TouchableOpacity>
                                )}
                                {visibleCount > 0 && (
                                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => hideReplies(item.id)} style={[styles.replyToggleBtn, { marginLeft: 16 }]}>
                                        <Text style={styles.toggleRepliesText}>Hide</Text>
                                        <ChevronUp size={12} color="#888" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    const totalCount = comments.reduce((total, c) => total + 1 + (c.replies?.length || 0), 0);

    return (
        <Modal
            visible={isFocused ?? true}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                <KeyboardAvoidingView
                    style={styles.keyboardWrapper}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={styles.headerText}>
                            Comments{totalCount > 0 ? ` · ${totalCount}` : ''}
                        </Text>
                        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={20} color="#888" />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator size="large" color="#A855F7" />
                        </View>
                    ) : !isCommentsEnabled ? (
                        <View style={styles.centered}>
                            <MessageSquareOff size={40} color="#333" />
                            <Text style={styles.disabledText}>Comments are disabled</Text>
                        </View>
                    ) : comments.length === 0 ? (
                        <View style={styles.centered}>
                            <MessageSquare size={40} color="#333" />
                            <Text style={styles.disabledText}>No comments yet</Text>
                            <Text style={styles.disabledSubtext}>Be the first to comment</Text>
                        </View>
                    ) : (
                        <FlatList
                            style={{ flex: 1 }}
                            data={comments}
                            renderItem={renderComment}
                            keyExtractor={item => item.id.toString()}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        />
                    )}

                    {replyingTo && (
                        <View style={styles.replyingToBar}>
                            <Text style={styles.replyingToText}>
                                Replying to <Text style={{ color: '#A855F7' }}>{replyingTo.user.username}</Text>
                            </Text>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setReplyingTo(null)}>
                                <X size={14} color="#888" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {isCommentsEnabled && (
                        <View style={styles.inputRow}>
                            <Image source={{ uri: user?.avatar ?? undefined }} style={styles.inputAvatar} />
                            <View style={styles.inputWrap}>
                                <TextInput
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    placeholder={`Comment for ${owner ?? 'post'}...`}
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.input}
                                    returnKeyType="send"
                                    onSubmitEditing={handleSendComment}
                                    multiline
                                    maxLength={500}
                                />
                            </View>
                            <TouchableOpacity
                                onPress={handleSendComment}
                                disabled={!commentText.trim()}
                                style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
                            >
                                <LinearGradient
                                    colors={commentText.trim() ? ['#A855F7', '#7C3AED'] : colors.disabledSendBg}
                                    style={styles.sendBtnGradient}
                                >
                                    <ArrowUp size={20} color={commentText.trim() ? '#fff' : colors.disabledSendArrow} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </Animated.View>
        </Modal>
    );
};

const themeColors = {
    dark: {
        sheetBg: '#0f0f0f',
        sheetBorder: 'rgba(255,255,255,0.07)',
        handleBg: '#333',
        headerBorder: 'rgba(255,255,255,0.06)',
        textPrimary: '#fff',
        textSecondary: '#ccc',
        textMuted: '#555',
        textMutedDark: '#3a3a3a',
        textMutedLight: '#666',
        replyingToBg: 'rgba(168,85,247,0.08)',
        replyingToBorder: 'rgba(168,85,247,0.15)',
        replyingToText: '#aaa',
        inputRowBg: '#0f0f0f',
        inputColor: '#fff',
        avatarBg: '#1a1a1a',
        containerBorder: 'rgba(255,255,255,0.04)',
        disabledSendBg: ['#1a1a1a', '#1a1a1a'] as const,
        disabledSendArrow: '#444',
    },
    light: {
        sheetBg: '#ffffff',
        sheetBorder: '#ebe8f0',
        handleBg: '#e2e8f0',
        headerBorder: '#f1f0f4',
        textPrimary: '#1A1225',
        textSecondary: '#4A3D54',
        textMuted: '#8A8296',
        textMutedDark: '#6B5F7A',
        textMutedLight: '#8A8296',
        replyingToBg: 'rgba(124, 58, 237, 0.04)',
        replyingToBorder: 'rgba(124, 58, 237, 0.1)',
        replyingToText: '#6B5F7A',
        inputRowBg: '#ffffff',
        inputColor: '#1A1225',
        avatarBg: '#f7f6f9',
        containerBorder: '#f1f0f4',
        disabledSendBg: ['#f1f0f4', '#f1f0f4'] as const,
        disabledSendArrow: '#b2acc0',
    }
};

const getStyles = (colors: any) => StyleSheet.create({
    keyboardWrapper: {
        flex: 1,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100%',
        maxHeight: SCREEN_HEIGHT * 0.70,
        marginTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
        backgroundColor: colors.sheetBg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: colors.sheetBorder,
        borderBottomWidth: 0,
        overflow: 'hidden',
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: colors.handleBg,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.headerBorder,
    },
    headerText: {
        fontSize: 16,
        color: colors.textPrimary,
        letterSpacing: 0.2,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        paddingBottom: 60,
    },
    disabledText: {
        color: colors.textMuted,
        fontSize: 15,
    },
    disabledSubtext: {
        color: colors.textMutedDark,
        fontSize: 13,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 120,
    },
    commentContainer: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.containerBorder,
    },
    replyContainer: {
        marginTop: 12,
        marginLeft: 46,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    commentContent: {
        flex: 1,
    },
    userDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 3,
    },
    username: {
        color: colors.textPrimary,
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
    },
    commentText: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    commentFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
    },
    commentFooterLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    timeText: {
        color: colors.textMuted,
        fontSize: 12,
    },
    replyBtn: {
        color: colors.textMutedLight,
        fontSize: 12,
        fontFamily: "Dank Mono Bold",
    },
    likeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    likeCount: {
        color: colors.textMutedLight,
        fontSize: 12,
    },
    repliesButtonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    replyToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    toggleRepliesText: {
        color: colors.textMuted,
        fontSize: 12,
    },
    showMoreText: {
        color: '#A855F7',
        marginTop: 4,
        fontSize: 13,
    },
    replyingToBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: colors.replyingToBg,
        borderTopWidth: 1,
        borderTopColor: colors.replyingToBorder,
    },
    replyingToText: {
        color: colors.replyingToText,
        fontSize: 13,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: colors.containerBorder,
        backgroundColor: colors.inputRowBg,
    },
    inputAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.avatarBg,
    },
    inputWrap: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#a955f747",
        paddingHorizontal: 14,
        minHeight: 40,
        justifyContent: 'center',
    },
    input: {
        color: colors.inputColor,
        fontSize: 14,
        maxHeight: 100,
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        overflow: 'hidden',
    },
    sendBtnDisabled: {
        opacity: 0.4,
    },
    sendBtnGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default PopupModal;