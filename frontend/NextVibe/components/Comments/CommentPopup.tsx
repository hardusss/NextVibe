import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import getComments from '@/src/api/get.comments';
import { MaterialIcons, Entypo, AntDesign } from '@expo/vector-icons';
import timeAgo from '@/src/utils/formatTime';
import { ActivityIndicator } from '../CustomActivityIndicator';
import getUserDetail from '@/src/api/user.detail';
import createComment from '@/src/api/create.comment';
import createCommentReply from '@/src/api/comment.reply';
import commentLike from '@/src/api/comment.like';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import VerifyBadge from '../VerifyBadge';

const { height: SCREEN_HEIGHT, width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REPLIES_BATCH_SIZE = 3;

interface User {
    username: string;
    avatar: string;
    official: boolean;
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
}

const PopupModal = ({ post_id, isCommentsEnabled = true, onClose }: PopupModalProps) => {
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

    // Open animation on mount
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
                // New structure: { post_id, author, comments: [...] }
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
                <FastImage source={{ uri: item.user.avatar }} style={styles.avatar} />
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
                                <MaterialIcons name={isLiked(item) ? 'favorite' : 'favorite-border'} size={16} color={isLiked(item) ? '#A855F7' : '#666'} />
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
                    <FastImage source={{ uri: item.user.avatar, priority: FastImage.priority.normal }} style={styles.avatar} resizeMode={FastImage.resizeMode.cover} />
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
                                    <MaterialIcons name={isLiked(item) ? 'favorite' : 'favorite-border'} size={16} color={isLiked(item) ? '#A855F7' : '#666'} />
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
                                        <Entypo name="chevron-down" size={12} color="#888" />
                                    </TouchableOpacity>
                                )}
                                {visibleCount > 0 && (
                                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => hideReplies(item.id)} style={[styles.replyToggleBtn, { marginLeft: 16 }]}>
                                        <Text style={styles.toggleRepliesText}>Hide</Text>
                                        <Entypo name="chevron-up" size={12} color="#888" />
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
            visible={true}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {/* Dim backdrop — tap to close */}
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

            {/* Sheet slides up from bottom */}
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Handle */}
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerText}>
                        Comments{totalCount > 0 ? ` · ${totalCount}` : ''}
                    </Text>
                    <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <AntDesign name="close" size={20} color="#888" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#A855F7" />
                    </View>
                ) : !isCommentsEnabled ? (
                    <View style={styles.centered}>
                        <MaterialIcons name="comments-disabled" size={40} color="#333" />
                        <Text style={styles.disabledText}>Comments are disabled</Text>
                    </View>
                ) : comments.length === 0 ? (
                    <View style={styles.centered}>
                        <MaterialIcons name="chat-bubble-outline" size={40} color="#333" />
                        <Text style={styles.disabledText}>No comments yet</Text>
                        <Text style={styles.disabledSubtext}>Be the first to comment</Text>
                    </View>
                ) : (
                    <FlatList
                        data={comments}
                        renderItem={renderComment}
                        keyExtractor={item => item.id.toString()}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {/* Replying to bar */}
                {replyingTo && (
                    <View style={styles.replyingToBar}>
                        <Text style={styles.replyingToText}>
                            Replying to <Text style={{ color: '#A855F7' }}>{replyingTo.user.username}</Text>
                        </Text>
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setReplyingTo(null)}>
                            <AntDesign name="close" size={14} color="#888" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Input */}
                {isCommentsEnabled && (
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={styles.inputRow}>
                            <FastImage source={{ uri: user?.avatar ?? undefined }} style={styles.inputAvatar} />
                            <View style={styles.inputWrap}>
                                <TextInput
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    placeholder={`Comment for ${owner ?? 'post'}...`}
                                    placeholderTextColor="#555"
                                    style={styles.input}
                                    returnKeyType="send"
                                    onSubmitEditing={handleSendComment}
                                    multiline
                                    maxLength={500}
                                    autoFocus
                                />
                            </View>
                            <TouchableOpacity
                                onPress={handleSendComment}
                                disabled={!commentText.trim()}
                                style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
                            >
                                <LinearGradient
                                    colors={commentText.trim() ? ['#A855F7', '#7C3AED'] : ['#1a1a1a', '#1a1a1a']}
                                    style={styles.sendBtnGradient}
                                >
                                    <MaterialIcons name="arrow-upward" size={20} color={commentText.trim() ? '#fff' : '#444'} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                )}
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.80,
        backgroundColor: '#0f0f0f',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderBottomWidth: 0,
        overflow: 'hidden',
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: '#333',
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
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    headerText: {
        fontSize: 16,
        color: '#fff',
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
        color: '#555',
        fontSize: 15,
    },
    disabledSubtext: {
        color: '#3a3a3a',
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
        borderBottomColor: 'rgba(255,255,255,0.04)',
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
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1a1a1a',
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
        color: '#fff',
        fontFamily: "Dank Mono Bold",
        fontSize: 13,
    },
    commentText: {
        fontSize: 14,
        color: '#ccc',
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
        color: '#555',
        fontSize: 12,
    },
    replyBtn: {
        color: '#666',
        fontSize: 12,
        fontFamily: "Dank Mono Bold",
    },
    likeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    likeCount: {
        color: '#666',
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
        color: '#888',
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
        backgroundColor: 'rgba(168,85,247,0.08)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(168,85,247,0.15)',
    },
    replyingToText: {
        color: '#aaa',
        fontSize: 13,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(46, 26, 87, 0.06)',
        backgroundColor: '#0f0f0f',
    },
    inputAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1a1a1a',
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
        color: '#fff',
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