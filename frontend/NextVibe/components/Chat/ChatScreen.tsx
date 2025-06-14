import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  useColorScheme,
  StyleSheet,
  Image,
  ActivityIndicator,
  Text,
  ScrollView,
  Alert
} from 'react-native';
import { MaterialIcons, AntDesign, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ChatBubble from './ChatBubble';
import GetApiUrl from '@/src/utils/url_api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMessages, connectWebSocket, sendWebSocketMessage, sendReadStatus, notifyEnterChat, getWebSocket } from '@/src/api/chat';
import getUserDetail from '@/src/api/user.detail';
import MediaPickerModal from './MediaPickerModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MediaAttachment {
  id: number;
  file_url: string | null;
}

interface Message {
  message_id: number;
  content: string;
  sender_id: number;
  created_at: string;
  is_read: boolean;
  media: MediaAttachment[];
}


interface UserDetails {
  user_id: number;
  username: string;
  avatar: string;
  created_at: string;
  readers_count: number;
  post_count: number;
  official: boolean;
}

interface ImagePickerAsset {
  uri: string;
  width: number;
  height: number;
  type?: string;
}


export default function ChatScreen() {
  const { id, userId } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);
  const [userDetailsLoading, setUserDetailsLoading] = useState(true);
  const [userIdState, setUserIdState] = useState<number | null>(null);
  const [lastMessageId, setLastMessageId] = useState<number | undefined>(undefined);
  const [readStatus, setReadStatus] = useState<{timestamp: string | null, readerId: number | null}>({
    timestamp: null,
    readerId: null
  });
  const flatListRef = useRef<FlatList>(null);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);
  const fetchMessages = async (loadMore = false) => {
    if (loading || (!hasMore && loadMore)) return;
    
    setLoading(true);

    try {
      const response = await getMessages(+id, loadMore ? lastMessageId : undefined);
      const newMessages = response;
      
      if (loadMore) {
        setMessages(prev => [...prev, ...newMessages]);
      } else {
        setMessages(newMessages);
      }
      
      setHasMore(newMessages.length === 6);
      if (newMessages.length > 0) {
        setLastMessageId(newMessages[newMessages.length - 1].message_id);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserId = async () => {
    const id_ = await AsyncStorage.getItem('id');
    setUserIdState(Number(id_));
  };

  useEffect(() => {
    fetchUserId();
  }, []);

  const fetchUserDetails = async () => {
    if (userId) {
      setUserDetailsLoading(true);
      try {
        const details = await getUserDetail(+userId);
        setUserDetails(details || { 
          username: 'User',
          avatar: '',
          created_at: new Date().toISOString(),
          readers_count: 0,
          post_count: 0
        });
      } catch (error) {
        console.error('Error fetching user details:', error);
      } finally {
        setUserDetailsLoading(false);
      }
    }
  };

  const pickMedia = async () => {
    setIsMediaPickerVisible(true);
  };

  const handleCameraPress = async () => {
    setIsMediaPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      alert('Sorry, we need camera permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setSelectedMedia(prev => [...prev, ...result.assets]);
    }
  };

  const handleGalleryPress = async () => {
    setIsMediaPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      alert('Sorry, we need gallery permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      setSelectedMedia(prev => [...prev, ...result.assets]);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() && selectedMedia.length === 0) return;
    
    const tempMessage: Message = {
      message_id: Date.now(),
      content: text.trim(),
      sender_id: userIdState!,
      created_at: new Date().toISOString(),
      is_read: false,
      media: selectedMedia.map((media, index) => ({
        id: Date.now() + index,
        file_url: media.uri
      }))
    };
    
    setMessages(prev => [tempMessage, ...prev]);
    await sendWebSocketMessage(+id, text.trim(), selectedMedia);
    
    setText('');
    setSelectedMedia([]);
  };

  useEffect(() => {
    if (userIdState) {
      connectWebSocket(+userIdState, (data) => {
        if (data.type === "message_edited" && data.chat_id === +id) {
          setMessages(prev => prev.map(msg => 
            msg.message_id === data.message_id 
              ? { ...msg, content: data.content, edited_at: data.edited_at }
              : msg
          ));
        } else if (data.type === "message_deleted" && data.chat_id === +id) {
          setMessages(prev => prev.filter(msg => msg.message_id !== data.message_id));
        } else if (data.type === "messages_read" && data.chat_id === +id) {
          if (data.reader_id !== userIdState) {
            setReadStatus({
              timestamp: data.timestamp,
              readerId: data.reader_id
            });
          }
        } else if (data.chat_id === +id) {
          if (data.sender_id !== userIdState) {
            setMessages(prev => [{
              message_id: data.message_id,
              sender_id: data.sender_id,
              content: data.content,
              created_at: data.created_at,
              is_read: false,
              media: data.media || []
            }, ...prev]);
    
            notifyEnterChat(+id);
          } else {
            // Знаходимо тимчасове повідомлення і оновлюємо його з реальними даними
            setMessages(prev => 
              prev.map(msg => 
                msg.sender_id === userIdState && msg.media.some(m => !m.file_url?.startsWith('/media/'))
                  ? {
                      ...msg,
                      message_id: data.message_id,
                      media: data.media || []
                    }
                  : msg
              )
            );
          }
        }
      });
    }
  }, [userIdState, id]);

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);
  
  useEffect(() => {
    if (id) {
      fetchMessages();
    }
  }, [id]);

  useEffect(() => {
    if (messages.length > 0 && userIdState) {
      const unreadMessages = messages.some(
        msg => !msg.is_read && msg.sender_id !== userIdState
      );
      
      if (unreadMessages) {
        sendReadStatus(+id);
      }
    }
  }, [messages, userIdState]);

  useEffect(() => {
    if (userIdState && id) {
      notifyEnterChat(+id);
    }
  }, [userIdState, id]);

  const EmptyChat = () => (
    <View style={styles.emptyContainer}>
      {userDetailsLoading ? (
        <ActivityIndicator color="#00CED1" />
      ) : (
        <View style={styles.userInfoColumn}>
          <View style={styles.avatarSection}>
            <Image 
              source={{ 
                uri: userDetails?.avatar 
                  ? `${GetApiUrl().slice(0, 25)}${userDetails.avatar}` 
                  : `${GetApiUrl().slice(0, 25)}/media/images/default.png`
              }} 
              style={styles.profileImage} 
            />
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>
              {userDetails?.username || 'User'}
            </Text>
            {userDetails?.official && (
              <Ionicons name="checkmark-circle" size={20} color="#00CED1" style={styles.verifiedBadge} />
            )}
          </View>
            </View>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userDetails?.readers_count || 0}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userDetails?.post_count || 0}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
          </View>
          <Text style={styles.joinDate}>
            Joined {new Date(userDetails?.created_at || '').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={ styles.container}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity 
            onPress={() => router.push('/chats')}
            style={styles.backButton}
          >
            <AntDesign name="arrowleft" size={24} color={isDark ? '#fff' : '#000'} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.userInfo} onPress={() => router.push({ pathname: "/user-profile", params: { id: userDetails?.user_id, last_page: `/chat-room?id=${id}`} })}>
            <Image 
              source={{ 
                uri: userDetails?.avatar 
                  ? `${GetApiUrl().slice(0, 25)}${userDetails.avatar}` 
                  : `${GetApiUrl().slice(0, 25)}/media/images/default.png`
              }} 
              style={styles.headerAvatar} 
            />
            <View style={styles.headerUsernameContainer}>
              <Text style={[styles.headerUsername, { color: isDark ? '#fff' : '#000' }]}>
                {userDetails?.username || ''}
              </Text>
              {userDetails?.official && (
                <Ionicons name="checkmark-circle" size={16} color="#00CED1" style={styles.headerVerifiedBadge} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.rightPlaceholder} />
        </View>
        
        {loading && messages.length === 0 ? (
          <ActivityIndicator style={styles.loading} color="#00CED1" />
        ) : messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <View style={styles.chatContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              inverted
              renderItem={({ item }) => (
                <ChatBubble message={item} />
              )}
              keyExtractor={item => item.message_id.toString()}
              onEndReached={() => fetchMessages(true)}
              onEndReachedThreshold={0.7}
              style={styles.messagesList}
              contentContainerStyle={{ flexGrow: 1 }}
            />
            {readStatus.timestamp && readStatus.readerId !== userIdState && (
              <View style={styles.readStatusContainer}>
                <Text style={styles.readStatusText}>
                  Read {new Date(readStatus.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.inputContainer, Platform.OS === 'android' && { paddingBottom: 10 }]}>
          <View style={styles.mediaInputRow}>
            {selectedMedia.length > 0 && (
              <ScrollView 
                horizontal 
                style={styles.previewList}
                showsHorizontalScrollIndicator={false}
              >
                {selectedMedia.map((media, index) => (
                  <View key={index} style={styles.previewContainer}>
                    <Image source={{ uri: media.uri }} style={styles.previewImage} />
                    <TouchableOpacity 
                      style={styles.removeButton}
                      onPress={() => setSelectedMedia(prev => 
                        prev.filter((_, i) => i !== index)
                      )}
                    >
                      <MaterialIcons name="close" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            </View>
            
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={pickMedia} style={styles.mediaButton}>
                <MaterialIcons 
                  name="camera-alt" 
                  size={24} 
                  color={isDark ? '#fff' : '#000'} 
                />
              </TouchableOpacity>
              
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message..."
                placeholderTextColor={isDark ? '#666' : '#999'}
                style={[styles.input, { color: isDark ? '#fff' : '#000' }]}
                multiline
              />
              
              <TouchableOpacity 
                onPress={sendMessage}
                style={[styles.sendButton, !text.trim() && !selectedMedia.length && styles.sendButtonDisabled]}
                disabled={!text.trim() && !selectedMedia.length}
              >
                <MaterialIcons name="send" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
        </View>
      </View>

      <MediaPickerModal
        visible={isMediaPickerVisible}
        onClose={() => setIsMediaPickerVisible(false)}
        onCameraPress={handleCameraPress}
        onGalleryPress={handleGalleryPress}
      />
    </KeyboardAvoidingView>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000' : '#fff'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  messagesList: {
    flex: 1,
    padding: 10
  },
  inputContainer: {
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#333' : '#eee',
    backgroundColor: isDark ? '#000' : '#fff',
  },
  mediaInputRow: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  input: {
    flex: 1,
    marginHorizontal: 10,
    padding: 10,
    maxHeight: 100,
    borderRadius: 20,
    backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0'
  },
  mediaButton: {
    padding: 10
  },
  sendButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#00CED1'
  },
  sendButtonDisabled: {
    opacity: 0.5
  },
  previewList: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  previewContainer: {
    marginRight: 8,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  headerUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: isDark ? '#fff' : '#000',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  userInfoColumn: {
    alignItems: 'center',
    width: '100%',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '80%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: isDark ? '#333' : '#eee',
    marginHorizontal: 20,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: isDark ? '#fff' : '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: isDark ? '#aaa' : '#666',
  },
  joinDate: {
    fontSize: 14,
    color: isDark ? '#aaa' : '#666',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#333' : '#eee',
    backgroundColor: isDark ? '#000' : '#fff',
  },
  backButton: {
    width: 40,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightPlaceholder: {
    width: 40,
  },
  headerUsernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerVerifiedBadge: {
    marginLeft: 4,
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  readStatusContainer: {
    position: 'absolute',
    bottom: 10,
    right: 20,
    backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
    padding: 8,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  readStatusText: {
    color: isDark ? '#fff' : '#666',
    fontSize: 12,
  },
  chatContainer: {
    flex: 1,
    position: 'relative',
  },
});