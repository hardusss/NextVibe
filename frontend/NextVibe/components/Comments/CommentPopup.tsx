import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  Animated, 
  Dimensions, 
  PanResponder, 
  FlatList, 
  StyleSheet, 
  Image,
  LayoutAnimation,
  UIManager,
  Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import getComments from '@/src/api/get.comments';
import GetApiUrl from '@/src/utils/url_api';
import { MaterialIcons, Entypo, AntDesign } from '@expo/vector-icons';
import timeAgo from '@/src/utils/formatTime';
import { ActivityIndicator } from '../CustomActivityIndicator';
import getUserDetail from '@/src/api/user.detail';
import createComment from '@/src/api/create.comment';
import createCommentReply from '@/src/api/comment.reply';
import commentLike from '@/src/api/comment.like';
import FastImage from 'react-native-fast-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const { height, width } = Dimensions.get('window');

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
};

interface PopupModalProps {
  post_id: number;
  isCommentsEnabled?: boolean;
  onClose: () => void;
}
const PopupModal = ({ post_id, isCommentsEnabled = true, onClose }: PopupModalProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;
  const [comments, setComments] = useState<Comment[]>([]);
  const [expandedComments, setExpandedComments] = useState<{ [key: number]: number }>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData>();
  const [owner, setOwner] = useState<string | null>(null);
  const [likedComments, setLikedComments] = useState<{ comments: { [key: number]: boolean }, replies: { [key: number]: boolean } }>({ comments: {}, replies: {} });
  const [replyingTo, setReplyingTo] = useState<Comment | Reply | null>(null);
  const [commentText, setCommentText] = useState<string>('');
  const [expandedTexts, setExpandedTexts] = useState<{ [key: string]: boolean }>({});

  const openModal = () => {
    setModalVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      onClose();
    });
  };

  useFocusEffect(
    useCallback(() => {
      const getData = async () => {
        try {
          const data = await getComments(post_id);
          if (Array.isArray(data)) {
            setOwner(data[0].author);
            setComments(data.slice(1));;
          } else {
            console.error("Data is not array!", data);
            setComments([]);
          }
        } catch (error) {
          console.error("Error get data", error);
          setComments([]);
        } finally {
          setLoading(false);
        }
      };
      const getUser = async () => {
        const user = await getUserDetail();
        setUser(user);
        setLikedComments({ 
          comments: user.liked_comments.reduce((acc: any, id: number) => ({ ...acc, [id]: true }), {}),
          replies: user.liked_comment_replies.reduce((acc: any, id: number) => ({ ...acc, [id]: true }), {})
        })
      };
      getUser();
      getData();
      openModal();
    }, [post_id])
  );

  const showMoreReplies = (commentId: number, totalReplies: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedComments((prev) => {
      const currentCount = prev[commentId] || 0;
      const newCount = Math.min(totalReplies, currentCount + REPLIES_BATCH_SIZE);
      return {
        ...prev,
        [commentId]: newCount,
      };
    });
  };

  const hideReplies = (commentId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedComments((prev) => ({
      ...prev,
      [commentId]: 0,
    }));
  };

  const handleCommentLike = async (commentId: number, isReply: boolean) => {
    await commentLike(commentId, isReply);
  };

  const isLiked = (item: Comment | Reply): boolean => {
    if ('reply_id' in item) {
      return likedComments.replies[item.reply_id] || false;
    } else {
      return likedComments.comments[item.id] || false;
    }
  };


  const toggleLike = async (item: Comment | Reply) => {
    await handleCommentLike('reply_id' in item ? item.reply_id : item.id, 'reply_id' in item);
    
    const isCurrentlyLiked = isLiked(item);
    
    setLikedComments((prev) => {
      if ('reply_id' in item) {
        return {
          ...prev,
          replies: {
            ...prev.replies,
            [item.reply_id]: !prev.replies[item.reply_id]
          }
        };
      } else {
        return {
          ...prev,
          comments: {
            ...prev.comments,
            [item.id]: !prev.comments[item.id]
          }
        };
      }
    });

    setComments((prevComments) => 
      prevComments.map((comment) => {
        if ('reply_id' in item) {
          if (comment.replies.some(r => r.reply_id === item.reply_id)) {
            return {
              ...comment,
              replies: comment.replies.map(reply => 
                reply.reply_id === item.reply_id
                  ? { ...reply, count_likes: reply.count_likes + (isCurrentlyLiked ? -1 : 1) }
                  : reply
              )
            };
          }
        } else if (comment.id === item.id) {
          return {
            ...comment,
            count_likes: comment.count_likes + (isCurrentlyLiked ? -1 : 1)
          };
        }
        return comment;
      })
    );
  };

  const handleReply = (commentOrReply: Comment | Reply) => {
    if (!isCommentsEnabled) return;
    setReplyingTo(commentOrReply);
  };

  const findParentComment = (replyId: number): Comment | null => {
    for (const comment of comments) {
      if (comment.replies.some(reply => reply.reply_id === replyId)) {
        return comment;
      }
    }
    return null;
  };

  const handleSendReply = async () => {
    if (!replyingTo || !commentText) return;

    const content = commentText;
    
    const commentId = 'id' in replyingTo 
      ? replyingTo.id 
      : (findParentComment(replyingTo.reply_id)?.id || replyingTo.reply_id);

    const response = await createCommentReply(content, commentId);
    if (response) {
      let newTotalReplies = 0;
      setComments(prevComments => {
        return prevComments.map(comment => {
          if (comment.id === commentId) {
            const updatedReplies = comment.replies ? [...comment.replies, response] : [response];
            newTotalReplies = updatedReplies.length;
            return {
              ...comment,
              replies: updatedReplies
            };
          }
          return comment;
        });
      });
      
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedComments(prev => ({
        ...prev,
        [commentId]: newTotalReplies
      }));
    }
  };

  const handleSendComment = async () => {
    if (!commentText) return;
    if (!isCommentsEnabled) return;
    
    if (replyingTo === null) {
      const response = await createComment(commentText, post_id);
      setCommentText("");
      setComments((prev) => [response, ...prev]);
    } else {
      await handleSendReply();
      setCommentText("");
      setReplyingTo(null);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isTopArea = evt.nativeEvent.locationY < 50;
        return isTopArea && gestureState.dy > 0;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0 && gestureState.dy <= height) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 100) {
          closeModal();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const toggleText = (id: string) => {
    setExpandedTexts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderCommentText = (text: string, id: string) => {
    if (text.length <= 200 || expandedTexts[id]) {
      return <Text style={styles.commentText}>{text}</Text>;
    }
    return (
      <View>
        <Text style={styles.commentText}>
          {text.slice(0, 200)}...
        </Text>
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleText(id)}>
          <Text style={styles.showMoreText}>Show more</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const currentVisibleCount = expandedComments[item.id] || 0;
    const totalReplies = item.replies?.length || 0;
    const areAllRepliesShown = currentVisibleCount === totalReplies;

    let showMoreText = `View answers: ${totalReplies}`;
    if (currentVisibleCount > 0) {
        const remaining = totalReplies - currentVisibleCount;
        showMoreText = `View ${remaining} more`;
    }

    return (
      <View style={styles.commentContainer}>
        <View style={styles.userInfo}>
          <FastImage
            source={{ 
              uri: `${item.user.avatar}`,
              priority: FastImage.priority.normal,
              cache: FastImage.cacheControl.immutable
            }}
            style={styles.avatar}
            resizeMode={FastImage.resizeMode.cover}
          />
          <View style={styles.commentContent}>
            <View style={styles.userDetails}>
              <Text style={styles.username}>{item.user.username}</Text>
              {item.user.official && (
                <MaterialIcons name="check-circle" size={12} color="#58a6ff" style={{ marginLeft: 5 }} />
              )}
            </View>
            {renderCommentText(item.content, `comment-${item.id}`)}
            <View style={{flexDirection: "row", justifyContent: "space-between", alignItems: "center"}}>
              <View style={{flexDirection: "row", gap: 10, marginTop: 5}}>
                <Text style={{color: "gray", fontWeight: "300"}}>{timeAgo(item.create_at)}</Text>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => handleReply(item)}>
                  <Text style={{color: "gray", fontWeight: "bold"}}>Reply</Text>
                </TouchableOpacity>
              </View>
              <View>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item)}>
                  <View style={{flexDirection: "row", gap: 10, marginTop: 5}}>
                    <Text style={{color: "gray", fontSize: 12}}>{item.count_likes > 0 ? item.count_likes : ""} </Text>
                    <MaterialIcons 
                      name={isLiked(item) ? 'favorite' : 'favorite-border'} 
                      size={18} 
                      color={isLiked(item) ? "#40E0D0" : "#FFF"} 
                      style={isLiked(item) ? styles.neonShadow : null}
                    /> 
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            {currentVisibleCount > 0 && item.replies && (
              <FlatList
                data={item.replies.slice(0, currentVisibleCount)}
                renderItem={renderReply}
                keyExtractor={(reply) => reply.reply_id.toString()}
                scrollEnabled={false}
                nestedScrollEnabled={true}
              />
            )}
            {item.replies && item.replies.length > 0 && (
                <View style={styles.repliesButtonContainer}>
                    {!areAllRepliesShown && (
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => showMoreReplies(item.id, totalReplies)} style={styles.replyButton}>
                            <Text style={styles.toggleRepliesText}>
                                {showMoreText}
                            </Text>
                            <Entypo name="chevron-down" size={12} color="#d3d3d3" style={{marginTop: 1}}/> 
                        </TouchableOpacity>
                    )}
                    {currentVisibleCount > 0 && (
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => hideReplies(item.id)} style={[styles.replyButton, { marginLeft: 15 }]}>
                            <Text style={styles.toggleRepliesText}>
                                Hide Answers
                            </Text>
                            <Entypo name="chevron-up" size={12} color="#d3d3d3" style={{marginTop: 3}}/> 
                        </TouchableOpacity>
                    )}
                </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderReply = ({ item }: { item: Reply }) => (
    <View style={styles.replyContainer}>
      <View style={styles.userInfo}>
        <FastImage source={{ uri: `${item.user.avatar}` }} style={styles.avatar} />
        <View style={styles.commentContent}>
          <View style={styles.userDetails}>
            <Text style={styles.username}>{item.user.username}</Text>
            {item.user.official && (
              <MaterialIcons name="check-circle" size={12} color="#58a6ff" style={{ marginLeft: 5 }} />
            )}
          </View>
          {renderCommentText(item.content, `reply-${item.reply_id}`)}
          <View style={{flexDirection: "row", justifyContent: "space-between", alignItems: "center"}}>
            <View style={{flexDirection: "row", gap: 10, marginTop: 5}}>
              <Text style={{color: "gray", fontWeight: "300"}}>{timeAgo(item.create_at)}</Text>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => handleReply(item)}>
                <Text style={{color: "gray", fontWeight: "bold"}}>Reply</Text>
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => toggleLike(item)}>
                <View style={{flexDirection: "row", gap: 10, marginTop: 5}}>
                  <Text style={{color: "gray", fontSize: 12}}>{item.count_likes > 0 ? item.count_likes : ""} </Text>
                  <MaterialIcons 
                    name={isLiked(item) ? 'favorite' : 'favorite-border'} 
                    size={18} 
                    color={isLiked(item) ? "#40E0D0" : "#FFF"} 
                    style={isLiked(item) ? styles.neonShadow : null}
                  /> 
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Modal
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [{ translateY: slideAnim }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <BlurView
                intensity={80} 
                tint="dark"
                style={[styles.blurViewAbsolute, { borderTopLeftRadius: 20, borderTopRightRadius: 20 }]}
            />
            <View style={styles.header}>
              <View style={styles.bar} />
              <Text style={styles.headerText}>Comments: {comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)}</Text>
              <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={closeModal} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color="#0000ff" />
            ) : !isCommentsEnabled ? (
              <View style={styles.disabledCommentsContainer}>
                <Text style={styles.disabledCommentsText}>The author has disabled comments.</Text>
              </View>
            ) : comments.length === 0 ? (
              <Text style={styles.noCommentsText}>No comments available</Text>
            ) : (
              <FlatList
                data={comments}
                renderItem={renderComment}
                initialNumToRender={10}
                showsVerticalScrollIndicator={false}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 250 }}
                keyExtractor={(item) => item.id.toString()}
                scrollEventThrottle={16}
                bounces={true}
                overScrollMode="always"
                directionalLockEnabled={true}
                alwaysBounceVertical={true}
              />
            )}
            {replyingTo ? (
              <View style={styles.replyingToContainer}>
                <Text style={styles.replyingToText}>Replying to {replyingTo.user.username}</Text>
                <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => setReplyingTo(null)}>
                  <AntDesign name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ): ""}
            {isCommentsEnabled ? (
                <View style={styles.inputContainer}>
                  <BlurView
                    intensity={115} 
                    tint="dark"
                    style={styles.blurViewAbsolute}
                  />
                  <View style={styles.inputBorderContainer}> 
                    <FastImage source={{uri: `${user?.avatar}`}} style={{width: 35, height: 35, borderRadius: 17.5}}/>
                    <TextInput 
                      value={commentText} 
                      autoFocus 
                      returnKeyType='send' 
                      style={styles.input} 
                      placeholder={isCommentsEnabled ? `Add a comment for ${owner}...` : 'Comments are disabled by the author'} 
                      placeholderTextColor="#BBB" 
                      editable={isCommentsEnabled} 
                      onChange={(e) => setCommentText(e.nativeEvent.text)} 
                    />
                    <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.sendButton} onPress={handleSendComment} disabled={!commentText.trim() || !isCommentsEnabled}>
                      <LinearGradient
                          colors={['#A78BFA', '#5856D6']}
                          style={styles.sendButtonGradient}
                      >
                          <MaterialIcons name="arrow-upward" size={22} color={"white"}/>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
              </View>
            ) : null}
            
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
  inputContainer: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', 
    backgroundColor: 'rgba(0, 0, 0, 1)', 
    position: 'absolute',
    bottom: 0,
    width: width,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputBorderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '95%',
    paddingHorizontal: 5,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', 
    backgroundColor: 'rgba(0, 0, 0, 0.9)', 
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    color: '#FFF',
    fontSize: 16,
    backgroundColor: 'transparent',
  },
  sendButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginLeft: 5,
  },
  sendButtonGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.23)', 
    padding: 20,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: height * 0.8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', 
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative', 
    paddingVertical: 5,
  },
  bar: {
    width: 40,
    height: 5,
    backgroundColor: '#555',
    borderRadius: 2.5,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  noCommentsText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#FFF',
  },
  commentContainer: {
    marginVertical: 12, 
  },
  replyContainer: {
    marginTop: 15,
    marginLeft: 10, 
    marginVertical: 5,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start', 
  },
  avatar: {
    width: 36, 
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  commentContent: {
    flex: 1,
  },
  userDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 2, 
  },
  username: {
    color: "#FFF",
    fontSize: 15, 
    fontWeight: 'bold',
  },
  commentText: {
    fontSize: 15,
    marginTop: 3, 
    color: '#E0E0E0', 
  },
  replyText: {
    fontSize: 13,
    marginTop: 3,
    color: '#CCC',
  },
  repliesButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleRepliesText: {
    color: '#d3d3d3', 
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    right: 5,
    top: 5,
    padding: 5,
  },
  neonShadow: {
    textShadowColor: '#40E0D0',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(50, 50, 50, 0.7)', 
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 70 : 60,
    left: 0,
    right: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderTopWidth: 1,
  },
  replyingToText: {
    color: '#E0E0E0',
    marginRight: 10,
    fontSize: 14,
  },
  showMoreText: {
    color: '#40E0D0',
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledCommentsContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  disabledCommentsText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PopupModal;