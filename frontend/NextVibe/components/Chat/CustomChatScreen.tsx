import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import axios from 'axios';
import { storage } from '@/src/utils/storage';
import GetApiUrl from '@/src/utils/url_api';

interface Sender {
  user_id: number | null;
  username: string;
  wallet_address: string | null;
}

interface Message {
  id: string;
  text: string;
  created_at: string;
  sender: Sender;
}

export default function CustomChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const isFocused = useIsFocused();

  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  // State Management
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [pollingLoading, setPollingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // User details
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Cherry Chat details
  const [cherryRoomId, setCherryRoomId] = useState<string | null>(null);

  // 1. Fetch current user ID for message differentiation
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const savedId = await storage.getItem('id');
        if (savedId) {
          setCurrentUserId(Number(savedId));
        }
      } catch (err) {
        console.error('[CustomChatScreen] Error fetching user ID:', err);
      }
    };
    fetchUserId();
  }, []);

  // 2. Fetch/Resolve Cherry Room ID using existing endpoint
  const resolveRoomId = async () => {
    setLoadingRoom(true);
    setErrorMsg(null);
    try {
      const apiToken = await storage.getItem('access');
      if (!apiToken) {
        setErrorMsg('Authentication token is missing. Please log in again.');
        setLoadingRoom(false);
        return;
      }

      console.log('[CustomChatScreen] Resolving room ID for chatId:', chatId);
      const response = await axios.post(
        `${GetApiUrl()}/chat/cherry-embed-token/`,
        chatId ? { chatId: parseInt(chatId, 10) } : {},
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );

      if (response.data?.roomId) {
        setCherryRoomId(response.data.roomId);
        console.log('[CustomChatScreen] Cherry Room ID resolved:', response.data.roomId);
      } else {
        setErrorMsg('Failed to retrieve chat room credentials.');
      }
    } catch (error: any) {
      console.error('[CustomChatScreen] Error resolving room:', error?.response?.data || error);
      setErrorMsg(error?.response?.data?.error || 'Failed to authenticate chat session.');
    } finally {
      setLoadingRoom(false);
    }
  };

  useEffect(() => {
    if (chatId) {
      resolveRoomId();
    }
  }, [chatId]);

  // 3. Fetch messages from our custom backend proxy view
  const fetchMessages = async (showLoadingIndicator = false) => {
    if (!cherryRoomId) return;
    if (showLoadingIndicator) setPollingLoading(true);
    
    try {
      const apiToken = await storage.getItem('access');
      const response = await axios.get(
        `${GetApiUrl()}/chat/${cherryRoomId}/messages/`,
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );

      if (response.data?.messages) {
        // Sort messages newest first for FlatList inverted={true} rendering
        const sorted = response.data.messages.sort(
          (a: Message, b: Message) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMessages(sorted);
      }
    } catch (error: any) {
      console.error('[CustomChatScreen] Error fetching messages:', error?.response?.data || error);
      // Only set errorMsg on initial failure to prevent breaking UI during background polling
      if (messages.length === 0) {
        setErrorMsg('Failed to load message history.');
      }
    } finally {
      if (showLoadingIndicator) setPollingLoading(false);
    }
  };

  // 4. Short Polling Mechanism: Polls every 3 seconds when screen is focused
  useEffect(() => {
    if (!cherryRoomId || !isFocused) return;

    // Run initial fetch on focus/mount
    fetchMessages(messages.length === 0);

    const interval = setInterval(() => {
      fetchMessages(false);
    }, 3000);

    // Clean up interval on unmount or screen blur to prevent memory leaks
    return () => {
      clearInterval(interval);
      console.log('[CustomChatScreen] Short polling interval cleared.');
    };
  }, [cherryRoomId, isFocused]);

  // 5. Send message action
  const handleSendMessage = async () => {
    if (!inputText.trim() || !cherryRoomId || isSending) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsSending(true);

    // Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      text: messageText,
      created_at: new Date().toISOString(),
      sender: {
        user_id: currentUserId,
        username: 'Me',
        wallet_address: null
      }
    };
    setMessages(prev => [optimisticMsg, ...prev]);

    try {
      const apiToken = await storage.getItem('access');
      const response = await axios.post(
        `${GetApiUrl()}/chat/${cherryRoomId}/messages/`,
        { text: messageText },
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );

      if (response.data) {
        // Replace optimistic message with the real one returned from server
        setMessages(prev =>
          prev.map(msg => (msg.id === tempId ? response.data : msg))
        );
      }
    } catch (error: any) {
      console.error('[CustomChatScreen] Error sending message:', error?.response?.data || error);
      // Remove optimistic message and restore input text on failure
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setInputText(messageText);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Format time display
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  // Render bubble wrapper
  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.sender.user_id === currentUserId;

    return (
      <View style={[styles.bubbleRow, isMe ? styles.rowRight : styles.rowLeft]}>
        {!isMe && (
          <Text style={styles.senderLabel}>
            {item.sender.username || 'User'}
          </Text>
        )}
        <View style={[styles.bubbleContainer, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {!isMe && (
            <BlurView
              intensity={25}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <Text style={[styles.bubbleText, isMe ? styles.textMe : styles.textOther]}>
            {item.text}
          </Text>
          <Text style={[styles.bubbleTime, isMe ? styles.timeMe : styles.timeOther]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Sleek Translucent Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Chat Room</Text>
          {cherryRoomId && (
            <Text style={styles.headerSubtitle}>
              {pollingLoading ? 'Syncing...' : 'Connected'}
            </Text>
          )}
        </View>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Main Content Area */}
      {loadingRoom ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF5BA8" />
          <Text style={styles.infoText}>Loading Chat Session...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={resolveRoomId}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
              </View>
            }
          />

          {/* Sleek Text Input Container */}
          <BlurView intensity={30} tint="dark" style={styles.inputWrapper}>
            <View style={styles.inputInnerContainer}>
              <TextInput
                style={[styles.textInput, { maxHeight: 100 }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type a message..."
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                multiline
                keyboardAppearance="dark"
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !inputText.trim() && styles.sendButtonDisabled
                ]}
                onPress={handleSendMessage}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Send size={18} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

/*
  ========================================================================
  UPGRADING FROM SHORT POLLING TO WEBSOCKETS (REAL-TIME MVP STEP-BY-STEP)
  ========================================================================

  1. Backend Upgrades:
     - Install Django Channels and configure ASGI routing (`asgi.py`).
     - Create a Channels Consumer (e.g. `ChatConsumer` in `chat/consumers.py`)
       handling connection, room group joining, and sending messages.
     - Implement JWT-based connection authentication to verify the user.
     - When receiving a message in the consumer:
       - Validate user permission.
       - Post the message content JSON proxy to Cherry API (S2S).
       - Broadcast the event to the Channels channel group.

  2. Frontend Code Migration:
     - Keep a ref to track the WebSocket connection:
       const ws = useRef<WebSocket | null>(null);
     - Replace the `useEffect` interval logic with WebSocket instantiation:
       useEffect(() => {
         if (!cherryRoomId) return;
         
         const wsUrl = `wss://your-backend.com/ws/chat/${cherryRoomId}/?token=${apiToken}`;
         ws.current = new WebSocket(wsUrl);

         ws.current.onopen = () => {
           console.log('WebSocket Connected');
         };
         
         ws.current.onmessage = (event) => {
           const data = JSON.parse(event.data);
           if (data.type === 'chat_message') {
             // Prepend new messages to maintain FlatList inverted ordering
             setMessages(prev => [data.message, ...prev]);
           }
         };

         ws.current.onerror = (e) => console.error('WebSocket Error', e);
         ws.current.onclose = () => console.log('WebSocket Closed');

         return () => {
           ws.current?.close();
         };
       }, [cherryRoomId]);

     - Replace the `handleSendMessage` axios POST request with:
       ws.current?.send(JSON.stringify({ text: messageText }));
  ========================================================================
*/

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Dank Mono Bold',
  },
  headerSubtitle: {
    color: '#FF5BA8',
    fontSize: 11,
    fontFamily: 'Dank Mono',
    marginTop: 2,
  },
  headerRightPlaceholder: {
    width: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    fontFamily: 'Dank Mono',
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 15,
    fontFamily: 'Dank Mono',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Dank Mono Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 15,
    fontFamily: 'Dank Mono',
  },
  bubbleRow: {
    marginBottom: 12,
    maxWidth: '85%',
  },
  rowLeft: {
    alignSelf: 'flex-start',
  },
  rowRight: {
    alignSelf: 'flex-end',
  },
  senderLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: 'Dank Mono',
    marginBottom: 4,
    marginLeft: 4,
  },
  bubbleContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleMe: {
    backgroundColor: '#FF5BA8',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  textMe: {
    color: '#FFFFFF',
    fontFamily: 'Dank Mono',
  },
  textOther: {
    color: '#E2E8F0',
    fontFamily: 'Dank Mono',
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  timeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'Dank Mono',
  },
  timeOther: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'Dank Mono',
  },
  inputWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Dank Mono',
    paddingVertical: 4,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#FF5BA8',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255, 91, 168, 0.4)',
  },
});
