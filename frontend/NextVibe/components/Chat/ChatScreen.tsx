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
  StatusBar
} from 'react-native';
import { MaterialIcons, AntDesign, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ChatBubble from './ChatBubble';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMessages, sendWebSocketMessage, notifyEnterChat } from '@/src/api/chat';
import WebSocketService from '@/src/services/WebSocketService';
import getUserDetail from '@/src/api/user.detail';
import MediaPickerModal from './MediaPickerModal';
import { storage } from '@/src/utils/storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import VerifyBadge from '../VerifyBadge';

interface MediaAttachment {
  id: number;
  file_url: string | null;
}

interface Message {
  message_id: number | string;
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

export default function ChatScreen() {
  const { id, userId } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);
  const [userDetailsLoading, setUserDetailsLoading] = useState(true);
  const [userIdState, setUserIdState] = useState<number | null>(null);
  const [lastMessageId, setLastMessageId] = useState<number | undefined>(undefined);
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
      
      setHasMore(newMessages.length > 0);
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
    const id_ = await storage.getItem('id');
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
          post_count: 0,
          official: false,
          user_id: +userId
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
    
    const messageText = text.trim();
    const mediaToSend = [...selectedMedia];
    
    setText('');
    setSelectedMedia([]);

    await sendWebSocketMessage(+id, messageText, mediaToSend);
  };

  // WebSocket listener
  useEffect(() => {
    if (!userIdState) return;

    const handleWebSocketMessage = (data: any) => {
      // Only fot messages this chat
      if (data.chat_id !== +id) return;

      // New message from other user
      else if (data.message_id && data.sender_id !== userIdState) {
        setMessages(prev => {
          const exists = prev.some(msg => msg.message_id === data.message_id);
          if (exists) return prev;
          
          return [{
            message_id: data.message_id,
            sender_id: data.sender_id,
            content: data.content,
            created_at: data.created_at,
            is_read: false,
            media: data.media || []
          }, ...prev];
        });
      }
    };

    const unsubscribe = WebSocketService.addListener(handleWebSocketMessage);
    return () => unsubscribe();
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
                  ? `${userDetails.avatar}` 
                  : `https://media.nextvibe.io/images/default.png`
              }} 
              style={styles.profileImage} 
            />
            <View style={{flexDirection: "row", "alignItems": "center"}}>
                <Text style={[styles.username, {color: isDark ?  "white" : "black" }]}>{userDetails?.username}</Text>
                {userDetails?.official ? (
                    <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={true} size={24}/>
                ) : null}
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
      style={styles.container}
    >
      <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"}/>  
      <View style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <AntDesign name="arrowleft" size={24} color={isDark ? '#fff' : '#000'} />
          </TouchableOpacity>

          <TouchableOpacity 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            style={styles.userInfo} 
            onPress={() => router.push({ 
              pathname: "/user-profile", 
              params: { id: userDetails?.user_id, last_page: `/chat-room?id=${id}`} 
            })}
          >
            <Image 
              source={{ 
                uri: userDetails?.avatar 
                  ? `${userDetails.avatar}` 
                  : `https://media.nextvibe.io/images/default.png`
              }} 
              style={styles.headerAvatar} 
            />
            <View style={{flexDirection: "row", "alignItems": "center"}}>
                <Text style={[styles.headerUsername, {color: isDark ?  "white" : "black" }]}>{userDetails?.username}</Text>
                {userDetails?.official ? (
                    <VerifyBadge isLooped={false} isVisible={true} haveModal={false} isStatic={false} size={24}/>
                ) : null}
            </View>
          </TouchableOpacity>

          <View style={styles.rightPlaceholder} />
        </View>
        
        {loading && messages.length === 0 ? (
          <ActivityIndicator style={styles.loading} color="#00CED1" />
        ) : messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            inverted
            renderItem={({ item }) => (
              <ChatBubble message={item} />
            )}
            keyExtractor={item => item.message_id.toString()}
            onEndReached={() => fetchMessages(true)}
            onEndReachedThreshold={0.6}
            style={styles.messagesList}
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          />
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
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
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
            <BlurView
              intensity={isDark ? 30 : 90}
              tint={isDark ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <TouchableOpacity 
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
              onPress={pickMedia} 
              style={styles.mediaButton}
            >
              <MaterialIcons 
                name="camera-alt" 
                size={24} 
                color={isDark ? '#A09CB8' : '#333'} 
              />
            </TouchableOpacity>
            
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message..."
              placeholderTextColor={isDark ? '#666' : '#999'}
              style={[styles.inputField, { color: isDark ? '#fff' : '#000' }]}
              multiline
            />
            
            <TouchableOpacity 
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
              onPress={sendMessage}
              style={[styles.sendButton, !text.trim() && !selectedMedia.length && styles.sendButtonDisabled]}
              disabled={!text.trim() && !selectedMedia.length}
            >
              <LinearGradient
                colors={['#A78BFA', '#5856D6']}
                style={styles.sendButtonGradient}
              />
              <MaterialIcons name="send" size={22} color="#fff" />
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
    backgroundColor: isDark ? '#0A0410' : '#fff'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  messagesList: {
    flex: 1,
    paddingVertical: 0,
    padding: 10,
  },
  inputContainer: {
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    backgroundColor: isDark ? 'rgba(10, 4, 16, 0.8)' : 'rgba(255, 255, 255, 0.8)',
  },
  mediaInputRow: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
    overflow: 'hidden',
  },
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  inputField: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    maxHeight: 100,
    fontSize: 16,
    backgroundColor: 'transparent',
  },
  mediaButton: {
    paddingLeft: 15,
    paddingRight: 10,
    paddingVertical: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  sendButtonGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  sendButtonDisabled: {
    opacity: 0.5
  },
  previewList: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 5,
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
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    backgroundColor: isDark ? 'rgba(10, 4, 16, 0.8)' : 'rgba(255, 255, 255, 0.8)',
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
});