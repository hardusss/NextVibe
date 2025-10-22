import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Animated, Dimensions, PanResponder, FlatList, StyleSheet, Image } from 'react-native';
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

const { height, width } = Dimensions.get('window');

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
  const [expandedComments, setExpandedComments] = useState<{ [key: number]: boolean }>({});
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

  const toggleReplies = (commentId: number) => {
    setExpandedComments((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
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
    // Call the API to toggle like
    await handleCommentLike('reply_id' in item ? item.reply_id : item.id, 'reply_id' in item);
    
    // Get the current like state before updating
    const isCurrentlyLiked = isLiked(item);
    
    // Update like status in local state
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

    // Update comment/reply like count
    setComments((prevComments) => 
      prevComments.map((comment) => {
        if ('reply_id' in item) {
          // If it's a reply being liked
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
          // If it's a main comment being liked
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
      setComments(prevComments => {
        return prevComments.map(comment => {
          if (comment.id === commentId) {
            return {
              ...comment,
              replies: comment.replies ? [...comment.replies, response] : [response]
            };
          }
          return comment;
        });
      });
      
      setExpandedComments(prev => ({
        ...prev,
        [commentId]: true
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
        <TouchableOpacity onPress={() => toggleText(id)}>
          <Text style={styles.showMoreText}>Show more</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentContainer}>
      <View style={styles.userInfo}>
        <FastImage
          source={{ 
            uri: `${GetApiUrl().slice(0, 25)}/media/${item.user.avatar}`,
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
              <TouchableOpacity onPress={() => handleReply(item)}>
                <Text style={{color: "gray", fontWeight: "bold"}}>Reply</Text>
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity onPress={() => toggleLike(item)}>
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
          {expandedComments[item.id] && item.replies && (
            <FlatList
              data={item.replies}
              renderItem={renderReply}
              keyExtractor={(reply) => reply.reply_id.toString()}
              scrollEnabled={false}
              nestedScrollEnabled={true}
            />
          )}
          {item.replies && item.replies.length > 0 && (
            <TouchableOpacity onPress={() => toggleReplies(item.id)} style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.toggleRepliesText}>
                {expandedComments[item.id] ? 'Hide Answers' : ` View answers: ${item.replies.length}`}
              </Text>
              <Entypo name="chevron-down" size={12} color="#d3d3d3" style={{marginTop: 5}}/> 
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderReply = ({ item }: { item: Reply }) => (
    <View style={styles.replyContainer}>
      <View style={styles.userInfo}>
        <FastImage source={{ uri: `${GetApiUrl().slice(0, 25)}/media/${item.user.avatar}` }} style={styles.avatar} />
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
              <TouchableOpacity onPress={() => handleReply(item)}>
                <Text style={{color: "gray", fontWeight: "bold"}}>Reply</Text>
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity onPress={() => toggleLike(item)}>
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
            <View style={styles.header}>
              <View style={styles.bar} />
              <Text style={styles.headerText}>Comments: {comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)}</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color="#0000ff" />
            ) : !isCommentsEnabled ? (
              <View style={styles.disabledCommentsContainer}>
                <Text style={styles.disabledCommentsText}>The author has disabled comments. {isCommentsEnabled}</Text>
              </View>
            ) : comments.length === 0 ? (
              <Text style={styles.noCommentsText}>No comments available {isCommentsEnabled}</Text>
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
                <TouchableOpacity onPress={() => setReplyingTo(null)}>
                  <AntDesign name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ): ""}
            {isCommentsEnabled ? (
                <View style={styles.inputContainer}>
                  <FastImage source={{uri: `${GetApiUrl().slice(0, 25)}${user?.avatar}`}} style={{width: 50, height: 50, borderRadius: 50}}/>
                  <TextInput value={commentText} autoFocus returnKeyType='send' style={styles.input} placeholder={isCommentsEnabled ? `Add a comment for ${owner}...` : 'Comments are disabled by the author'} placeholderTextColor="#888" editable={isCommentsEnabled} onChange={(e) => setCommentText(e.nativeEvent.text)} />
                  <TouchableOpacity style={styles.sendButton} onPress={handleSendComment} disabled={!commentText.trim() || !isCommentsEnabled}>
                    <MaterialIcons name="arrow-upward" size={22} color={"white"}/>
                  </TouchableOpacity>
              </View>
            ) : null}
            
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 0.3,
    borderColor: 'gray',
    backgroundColor: '#2e2d2d',
    position: 'absolute',
    bottom: 0,
    width: width,
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    color: '#FFF',
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#007bff',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  sendButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
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
    backgroundColor: '#2e2d2d', 
    padding: 20,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: height * 0.8,
    position: 'relative',
    overflow: 'hidden'
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
  },
  bar: {
    width: 40,
    height: 5,
    backgroundColor: '#555',
    borderRadius: 2.5,
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
    marginVertical: 20, 
  },
  replyContainer: {
    marginTop: 20,
    marginLeft: 0,
    marginVertical: 5,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start', 
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  commentContent: {
    flex: 1,
  },
  userDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -5
  },
  username: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: 'bold',
  },
  commentText: {
    fontSize: 16,
    marginTop: 5,
    color: '#FFF',
  },
  replyText: {
    fontSize: 14,
    marginTop: 5,
    color: '#AAA',
  },
  toggleRepliesText: {
    color: '#d3d3d3', 
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  neonShadow: {
    textShadowColor: '#40E0D0',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 5,
    position: 'absolute',
    bottom: 61,
    left: 5,
    justifyContent: 'space-between',
  },
  replyingToText: {
    color: '#FFF',
    marginRight: 10,
  },
  showMoreText: {
    color: '#40E0D0',
    marginTop: 5,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledCommentsContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledCommentsText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PopupModal;