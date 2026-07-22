import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { storage } from '@/src/utils/storage';
import {
  getMessages,
  sendWebSocketMessage,
  notifyEnterChat,
  sendTypingStart,
  sendTypingStop
} from '@/src/api/chat';
import WebSocketService from '@/src/services/WebSocketService';
import ChatBubble from './ChatBubble';
import P2PStatusBadge from './P2PStatusBadge';
import ChatTransportManager from '@/src/services/ChatTransport';

interface Sender {
  user_id: number | null;
  username: string;
  wallet_address?: string | null;
}

interface MessageItem {
  id: string | number;
  server_msg_id?: number;
  chat_id: number;
  content?: string;
  text?: string;
  created_at: string;
  sender_id?: number;
  sender?: Sender;
  is_read?: boolean;
  reply_to_id?: number | null;
  reply_to_snippet?: any;
  reactions?: any[];
  receipts?: any[];
  media?: any[];
  edited_at?: string | null;
  deleted_at?: string | null;
}

export default function CustomChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const isFocused = useIsFocused();

  const { id } = useLocalSearchParams();
  const chatIdStr = Array.isArray(id) ? id[0] : id;
  const chatId = chatIdStr ? parseInt(chatIdStr, 10) : 0;

  // State Management
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [transportType, setTransportType] = useState<'server' | 'p2p'>('server');

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch current user ID for sender differentiation
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

  // Helper to strictly deduplicate message list by unique ID
  const deduplicateMessages = (list: MessageItem[]): MessageItem[] => {
    const seen = new Set<string>();
    const result: MessageItem[] = [];
    for (const m of list) {
      const primaryKey = String(m.server_msg_id || m.id || m.client_msg_id || '');
      if (primaryKey && !seen.has(primaryKey)) {
        seen.add(primaryKey);
        result.push(m);
      }
    }
    return result;
  };

  // 2. Fetch history from socket_service REST endpoint
  const loadInitialMessages = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getMessages(chatId);
      if (Array.isArray(data)) {
        const sorted = data.sort(
          (a: MessageItem, b: MessageItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMessages(deduplicateMessages(sorted));
        if (data.length < 20) {
          setHasMore(false);
        }
      }
    } catch (err: any) {
      console.error('[CustomChatScreen] Error loading messages:', err);
      setErrorMsg('Failed to load chat history.');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  // 3. Load older messages (Pagination)
  const loadOlderMessages = async () => {
    if (!chatId || loadingMore || !hasMore || messages.length === 0) return;
    const oldestMsg = messages[messages.length - 1];
    const oldestId = oldestMsg.server_msg_id || (typeof oldestMsg.id === 'number' ? oldestMsg.id : undefined);
    if (!oldestId) return;

    setLoadingMore(true);
    try {
      const data = await getMessages(chatId, oldestId);
      if (Array.isArray(data) && data.length > 0) {
        const sortedNew = data.sort(
          (a: MessageItem, b: MessageItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMessages(prev => deduplicateMessages([...prev, ...sortedNew]));
        if (data.length < 20) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[CustomChatScreen] Error loading older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 4. WebSocket Real-Time Event Handlers & Subscriptions
  useEffect(() => {
    if (!chatId || !isFocused) return;

    loadInitialMessages();
    notifyEnterChat(chatId);

    // Subscribe to Transport Manager for P2P state
    const unsubscribeTransport = ChatTransportManager.addListener({
      onTransportStateChange: (cId, state) => {
        if (cId === chatId) setTransportType(state);
      },
      onMessageReceived: (incoming) => {
        if (incoming.chat_id === chatId) {
          setMessages(prev => deduplicateMessages([incoming, ...prev]));
        }
      }
    });

    // Subscribe to WebSocketService global real-time frames
    const unsubscribeWS = WebSocketService.addListener((event: any) => {
      if (!event || event.chat_id !== chatId) return;

      if (event.type === 'message') {
        setMessages(prev => {
          const matchIndex = prev.findIndex(m => {
            const mKey = String(m.server_msg_id || m.id || m.client_msg_id);
            const incomingKey = String(event.server_msg_id || event.id || event.client_msg_id);
            return (
              (event.client_msg_id && m.id === event.client_msg_id) ||
              (event.client_msg_id && m.client_msg_id === event.client_msg_id) ||
              (incomingKey && mKey === incomingKey)
            );
          });

          if (matchIndex !== -1) {
            const copy = [...prev];
            copy[matchIndex] = { ...copy[matchIndex], ...event };
            return deduplicateMessages(copy);
          }
          return deduplicateMessages([event, ...prev]);
        });
      } else if (event.type === 'read_receipt') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || msg.id;
            if (event.message_ids?.some((id: any) => String(id) === String(msgId))) {
              return { ...msg, is_read: true };
            }
            return msg;
          })
        );
      } else if (event.type === 'reaction_update') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || msg.id;
            if (String(msgId) === String(event.message_id)) {
              return { ...msg, reactions: event.reactions };
            }
            return msg;
          })
        );
      } else if (event.type === 'typing_status') {
        if (event.user_id !== currentUserId) {
          setIsTyping(event.is_typing);
        }
      } else if (event.type === 'message_edited') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || msg.id;
            if (String(msgId) === String(event.message_id)) {
              return { ...msg, text: event.content, content: event.content, edited_at: event.edited_at };
            }
            return msg;
          })
        );
      } else if (event.type === 'message_deleted') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || msg.id;
            if (String(msgId) === String(event.message_id)) {
              return { ...msg, content: '[Message deleted]', text: '[Message deleted]', deleted_at: event.deleted_at };
            }
            return msg;
          })
        );
      }
    });

    return () => {
      unsubscribeWS();
      unsubscribeTransport();
    };
  }, [chatId, isFocused, currentUserId, loadInitialMessages]);

  // 5. Input Typing Indicator
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!chatId) return;

    sendTypingStart(chatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop(chatId);
    }, 3000);
  };

  // 6. Send Message Action
  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatId || isSending) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsSending(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingStop(chatId);

    const clientMsgId = `temp-${Date.now()}`;
    const optimisticMsg: MessageItem = {
      id: clientMsgId,
      chat_id: chatId,
      text: messageText,
      content: messageText,
      created_at: new Date().toISOString(),
      sender_id: currentUserId || undefined,
      sender: {
        user_id: currentUserId,
        username: 'Me'
      }
    };

    setMessages(prev => [optimisticMsg, ...prev]);

    try {
      await sendWebSocketMessage(chatId, messageText);
    } catch (err) {
      console.error('[CustomChatScreen] Error sending message:', err);
      setMessages(prev => prev.filter(m => m.id !== clientMsgId));
      setInputText(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const renderItem = ({ item }: { item: MessageItem }) => {
    const isMe = item.sender_id === currentUserId || item.sender?.user_id === currentUserId;

    return (
      <ChatBubble
        message={item}
        isMe={isMe}
        currentUserId={currentUserId || 0}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Chat Room</Text>
            <P2PStatusBadge isP2PActive={transportType === 'p2p'} />
          </View>
          <Text style={styles.headerSubtitle}>
            {isTyping ? 'typing...' : 'Real-time WebSocket'}
          </Text>
        </View>

        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF5BA8" />
          <Text style={styles.infoText}>Loading Chat History...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadInitialMessages}>
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
            keyExtractor={(item, index) => String(item.server_msg_id || item.id || item.client_msg_id || `msg_${index}`)}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color="#FF5BA8" style={{ marginVertical: 8 }} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
              </View>
            }
          />

          {/* Text Input Container */}
          <BlurView intensity={30} tint="dark" style={styles.inputWrapper}>
            <View style={styles.inputInnerContainer}>
              <TextInput
                style={[styles.textInput, { maxHeight: 100 }]}
                value={inputText}
                onChangeText={handleInputChange}
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
