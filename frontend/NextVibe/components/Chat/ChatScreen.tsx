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
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ChatBubble from './ChatBubble';
import GetApiUrl from '@/src/utils/url_api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMessages, connectWebSocket, sendWebSocketMessage } from '@/src/api/chat';
import getUserDetail from '@/src/api/user.detail';
import MediaPickerModal from './MediaPickerModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  message_id: number;
  sender_id: number;
  content: string;
  created_at: string;
}

interface FormDataValue {
  uri: string;
  name: string;
  type: string;
}

interface UserDetails {
  username: string;
  avatar: string;
  created_at: string;
  readers_count: number;
  post_count: number;
}

interface ImagePickerAsset {
  uri: string;
  width: number;
  height: number;
  type?: string;
}

interface ImagePickerResult {
  canceled: boolean;
  assets: ImagePickerAsset[];
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
  const flatListRef = useRef<FlatList>(null);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);

  useEffect(() => {console.log(userDetails)}, [userDetails])
  const fetchMessages = async (loadMore = false) => {
    if (loading || (!hasMore && loadMore)) return;
    
    setLoading(true);

    try {
      
      const response = await getMessages(+id);  
      const newMessages = response;
      if (loadMore) {
        setMessages(prev => [...prev, ...newMessages]);
      } else {
        setMessages(newMessages);
      }
      
      setHasMore(newMessages.length === 6);
      if (loadMore) {
        setOffset(prev => prev + 6);
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
    
    // Send via WebSocket
    sendWebSocketMessage(+id, text.trim());
    
    const mediaUrls = selectedMedia.map(media => media.uri);
    // Handle media upload separately

    setText('');
    setSelectedMedia([]);
  };

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
    if (userIdState) {
      connectWebSocket(+userIdState, (data) => {
        // Handle incoming message
        if (data.chat_id === +id) {
          setMessages(prev => [{
            message_id: data.message_id, // temporary id
            sender_id: data.user_id,
            content: data.message,
            created_at: data.created_at
          }, ...prev]);
        }
      });
    }
  }, [userIdState]);

  const EmptyChat = () => (
    <View style={styles.emptyContainer}>
      {userDetailsLoading ? (
        <ActivityIndicator color="#00CED1" />
      ) : (
        <View style={styles.userInfo}>
          <Image 
            source={{ 
              uri: userDetails?.avatar 
                ? `${GetApiUrl()}${userDetails.avatar}` 
                : `${GetApiUrl()}/media/images/default.png`
            }} 
            style={styles.headerAvatar} 
          />
          <Text style={[styles.headerUsername, { color: isDark ? '#fff' : '#000' }]}>
            {userDetails?.username || 'User'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.navbar}>
        <TouchableOpacity 
          onPress={() => router.push('/chats')}
          style={styles.backButton}
        >
          <AntDesign name="arrowleft" size={24} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>

        <View style={styles.userInfo}>
          <Image 
            source={{ 
              uri: userDetails?.avatar 
                ? `${GetApiUrl().slice(0, 23)}${userDetails.avatar}` 
                : `${GetApiUrl().slice(0, 23)}/media/images/default.png`
            }}
            style={styles.headerAvatar} 
          />
          <Text style={[styles.headerUsername, { color: isDark ? '#fff' : '#000' }]}>
            {userDetails?.username || ''}
          </Text>
        </View>


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
          renderItem={({ item }) => <ChatBubble message={item} />}
          keyExtractor={item => item.message_id.toString()}
          onEndReached={() => fetchMessages(true)}
          onEndReachedThreshold={0.1}
          style={styles.messagesList}
        />
      )}

      <View style={styles.inputContainer}>
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
    borderTopWidth: 1,
    borderTopColor: isDark ? '#333' : '#eee',
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
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: isDark ? '#fff' : '#000',
    marginBottom: 8,
  },
  joinDate: {
    fontSize: 14,
    color: isDark ? '#aaa' : '#666',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    marginHorizontal: 20,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: isDark ? '#fff' : '#000',
  },
  statLabel: {
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
});
