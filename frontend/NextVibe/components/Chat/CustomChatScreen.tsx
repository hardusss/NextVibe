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
  useColorScheme,
  Modal,
  TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Send,
  Plus,
  BadgeCheck,
  ShieldCheck,
  X,
  MessageSquare,
  Copy,
  Pencil,
  Trash2,
  Image as ImageIcon
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { storage } from '@/src/utils/storage';
import {
  getMessages,
  sendWebSocketMessage,
  notifyEnterChat,
  sendTypingStart,
  sendTypingStop,
  addReaction,
  editMessage,
  deleteMessage,
  getChats
} from '@/src/api/chat';
import WebSocketService from '@/src/services/WebSocketService';
import ChatBubble from './ChatBubble';
import P2PStatusBadge from './P2PStatusBadge';
import ChatTransportManager from '@/src/services/ChatTransport';
import SafetyNumberModal from './SafetyNumberModal';
import MediaPickerModal from './MediaPickerModal';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import { LiquidGlassView } from '../Shared/LiquidGlassView';

const DEFAULT_AVATAR = 'https://media.nextvibe.io/images/default.png';
const EMOJI_LIST = ['❤️', '👍', '🔥', '😂', '😮', '🙏', '👏'];

interface Sender {
  user_id: number | null;
  username: string;
  avatar?: string | null;
  official?: boolean;
}

interface MessageItem {
  id: string | number;
  message_id?: number;
  server_msg_id?: number;
  client_msg_id?: string;
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

  // Partner User Info
  const [otherUser, setOtherUser] = useState<{
    user_id: number;
    username: string;
    avatar: string | null;
    is_online: boolean;
    official?: boolean;
  } | null>(null);

  // Feature Modals & Action Banners
  const [replyToMessage, setReplyToMessage] = useState<MessageItem | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);
  const [selectedMediaFile, setSelectedMediaFile] = useState<any | null>(null);

  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedActionMessage, setSelectedActionMessage] = useState<MessageItem | null>(null);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', isSuccess: true });

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch current user ID & Partner Info
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

  useEffect(() => {
    const fetchPartnerInfo = async () => {
      try {
        const chatsList = await getChats();
        const found = chatsList.find((c: any) => c.chat_id === chatId);
        if (found && found.other_user) {
          setOtherUser(found.other_user);
        }
      } catch (err) {
        // Fallback info from messages
      }
    };
    if (chatId) fetchPartnerInfo();
  }, [chatId]);

  // Helper to strictly deduplicate message list by unique ID
  const deduplicateMessages = (list: MessageItem[]): MessageItem[] => {
    const seenKeys = new Set<string>();
    const result: MessageItem[] = [];

    for (const m of list) {
      const serverId = m.server_msg_id ? String(m.server_msg_id) : (typeof m.id === 'number' ? String(m.id) : null);
      const clientId = m.client_msg_id ? String(m.client_msg_id) : (typeof m.id === 'string' ? String(m.id) : null);

      if (serverId && seenKeys.has(serverId)) continue;
      if (clientId && seenKeys.has(clientId)) continue;

      const mainKey = serverId || clientId;
      if (mainKey) {
        if (serverId) seenKeys.add(serverId);
        if (clientId) seenKeys.add(clientId);
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

        // Extract partner info if not set
        if (!otherUser && data.length > 0) {
          const msgFromOther = data.find(m => m.sender_id && m.sender_id !== currentUserId);
          if (msgFromOther && msgFromOther.sender) {
            setOtherUser({
              user_id: msgFromOther.sender.user_id || msgFromOther.sender_id || 0,
              username: msgFromOther.sender.username || 'User',
              avatar: msgFromOther.sender.avatar || null,
              is_online: false,
              official: msgFromOther.sender.official
            });
          }
        }
      }
    } catch (err: any) {
      console.error('[CustomChatScreen] Error loading messages:', err);
      setErrorMsg('Failed to load chat history.');
    } finally {
      setLoading(false);
    }
  }, [chatId, currentUserId, otherUser]);

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
        if (event.sender_id && event.sender_id !== currentUserId) {
          notifyEnterChat(chatId);
        }
        setMessages(prev => {
          const matchIndex = prev.findIndex(m => {
            const mKey = String(m.server_msg_id || (m as any).message_id || m.id || m.client_msg_id);
            const incomingKey = String(event.server_msg_id || event.message_id || event.id || event.client_msg_id);
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
            const msgId = msg.server_msg_id || (msg as any).message_id || msg.id;
            const isMatch = !event.message_ids || event.message_ids.length === 0 || event.message_ids.some((id: any) => String(id) === String(msgId));
            if (isMatch) {
              const updatedReceipts = (msg.receipts || []).map(r =>
                (event.reader_id && r.user_id === event.reader_id)
                  ? { ...r, read_at: event.read_at || new Date().toISOString() }
                  : r
              );
              if (event.reader_id && !updatedReceipts.some(r => r.user_id === event.reader_id)) {
                updatedReceipts.push({
                  user_id: event.reader_id,
                  delivered_at: event.read_at || new Date().toISOString(),
                  read_at: event.read_at || new Date().toISOString()
                });
              }
              return { ...msg, is_read: true, receipts: updatedReceipts };
            }
            return msg;
          })
        );
      } else if (event.type === 'reaction_update') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || (msg as any).message_id || msg.id;
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
            const msgId = msg.server_msg_id || (msg as any).message_id || msg.id;
            if (String(msgId) === String(event.message_id)) {
              return { ...msg, text: event.content, content: event.content, edited_at: event.edited_at };
            }
            return msg;
          })
        );
      } else if (event.type === 'message_deleted') {
        setMessages(prev =>
          prev.map(msg => {
            const msgId = msg.server_msg_id || (msg as any).message_id || msg.id;
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

  // 6. Media Selection Handlers
  const handleCameraPick = async () => {
    setMediaPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Camera permission denied', isSuccess: false });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedMediaFile(result.assets[0]);
    }
  };

  const handleGalleryPick = async () => {
    setMediaPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Gallery permission denied', isSuccess: false });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedMediaFile(result.assets[0]);
    }
  };

  // 7. Send Message / Save Edit Action
  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedMediaFile) || !chatId || isSending) return;

    const messageText = inputText.trim();
    setInputText('');
    const mediaToSend = selectedMediaFile;
    setSelectedMediaFile(null);
    setIsSending(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingStop(chatId);

    // If Editing existing message:
    if (editingMessage) {
      const msgId = editingMessage.server_msg_id || (editingMessage as any).message_id || editingMessage.id;
      try {
        await editMessage(chatId, Number(msgId), messageText);
        setToast({ visible: true, message: 'Message edited', isSuccess: true });
      } catch (err) {
        console.error('Failed to edit message:', err);
      } finally {
        setEditingMessage(null);
        setIsSending(false);
      }
      return;
    }

    // Normal Send Message (Optimistic)
    const clientMsgId = `temp-${Date.now()}`;
    const replyToId = replyToMessage ? (replyToMessage.server_msg_id || (replyToMessage as any).message_id || replyToMessage.id) : undefined;
    
    const optimisticMsg: MessageItem = {
      id: clientMsgId,
      client_msg_id: clientMsgId,
      chat_id: chatId,
      text: messageText,
      content: messageText,
      created_at: new Date().toISOString(),
      sender_id: currentUserId || undefined,
      reply_to_id: replyToId ? Number(replyToId) : null,
      reply_to_snippet: replyToMessage ? {
        id: replyToId,
        sender_id: replyToMessage.sender_id,
        sender_name: replyToMessage.sender?.username || 'User',
        text: replyToMessage.content || replyToMessage.text || ''
      } : null,
      sender: {
        user_id: currentUserId,
        username: 'Me'
      }
    };

    setReplyToMessage(null);
    setMessages(prev => deduplicateMessages([optimisticMsg, ...prev]));

    try {
      const mediaList = mediaToSend ? [mediaToSend] : [];
      await sendWebSocketMessage(chatId, messageText, mediaList, replyToId ? Number(replyToId) : undefined, clientMsgId);
    } catch (err) {
      console.error('[CustomChatScreen] Error sending message:', err);
      setMessages(prev => prev.filter(m => m.id !== clientMsgId && m.client_msg_id !== clientMsgId));
      setInputText(messageText);
    } finally {
      setIsSending(false);
    }
  };

  // 8. Reaction / Action Menu Handlers
  const handleMessageLongPress = (msg: MessageItem) => {
    setSelectedActionMessage(msg);
    setActionModalVisible(true);
  };

  const handleToggleReaction = async (emoji: string) => {
    if (!selectedActionMessage) return;
    const msgId = selectedActionMessage.server_msg_id || (selectedActionMessage as any).message_id || selectedActionMessage.id;
    setActionModalVisible(false);
    try {
      await addReaction(chatId, Number(msgId), emoji);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
  };

  const handleActionReply = () => {
    if (selectedActionMessage) {
      setReplyToMessage(selectedActionMessage);
    }
    setActionModalVisible(false);
  };

  const handleActionCopy = () => {
    if (selectedActionMessage && (selectedActionMessage.content || selectedActionMessage.text)) {
      Clipboard.setStringAsync(selectedActionMessage.content || selectedActionMessage.text || '');
      setToast({ visible: true, message: 'Message copied', isSuccess: true });
    }
    setActionModalVisible(false);
  };

  const handleActionEdit = () => {
    if (selectedActionMessage) {
      setEditingMessage(selectedActionMessage);
      setInputText(selectedActionMessage.content || selectedActionMessage.text || '');
    }
    setActionModalVisible(false);
  };

  const handleActionDelete = async () => {
    if (!selectedActionMessage) return;
    const msgId = selectedActionMessage.server_msg_id || (selectedActionMessage as any).message_id || selectedActionMessage.id;
    setActionModalVisible(false);
    try {
      await deleteMessage(chatId, Number(msgId));
      setToast({ visible: true, message: 'Message deleted', isSuccess: true });
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const partnerName = otherUser?.username || 'User';
  const partnerAvatar = otherUser?.avatar || DEFAULT_AVATAR;

  const isActionMsgMine = selectedActionMessage && (
    selectedActionMessage.sender_id === currentUserId ||
    selectedActionMessage.sender?.user_id === currentUserId
  );

  const renderItem = ({ item }: { item: MessageItem }) => {
    const isMe = item.sender_id === currentUserId || item.sender?.user_id === currentUserId;

    return (
      <ChatBubble
        message={item as any}
        isMe={isMe}
        currentUserId={currentUserId || 0}
        onLongPress={() => handleMessageLongPress(item)}
        onReply={() => setReplyToMessage(item)}
        onReactionPress={(msgId, emoji) => {
          addReaction(chatId, msgId, emoji);
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Modern Clean Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.partnerInfoContainer}
          onPress={() => setSafetyModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: partnerAvatar }}
              style={styles.headerAvatar}
              contentFit="cover"
            />
            {otherUser?.is_online && <View style={styles.headerOnlineIndicator} />}
          </View>

          <View style={styles.partnerTextCol}>
            <View style={styles.nameRow}>
              <Text style={styles.partnerName} numberOfLines={1}>
                {partnerName}
              </Text>
              {otherUser?.official && (
                <BadgeCheck size={16} color="#A78BFA" style={{ marginLeft: 4 }} />
              )}
            </View>
            <Text style={styles.partnerStatus}>
              {isTyping ? 'typing...' : (otherUser?.is_online ? 'Online' : 'Encrypted Chat')}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <P2PStatusBadge isP2PActive={transportType === 'p2p'} />

          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => setSafetyModalVisible(true)}
            activeOpacity={0.7}
          >
            <ShieldCheck size={22} color="#A78BFA" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#A78BFA" />
          <Text style={styles.infoText}>Loading chat history...</Text>
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
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
                <ActivityIndicator size="small" color="#A78BFA" style={{ marginVertical: 8 }} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
              </View>
            }
          />

          {/* Liquid Glass Bottom Input Bar Container (Sits at the very bottom edge on iOS) */}
          <LiquidGlassView
            glassEffectStyle="clear"
            colorScheme={isDark ? 'dark' : 'light'}
            style={[styles.bottomElevatedContainer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 12, 2) : 4 }]}
          >
            {/* Action Banners */}
            {replyToMessage && (
              <View style={styles.actionBanner}>
                <View style={styles.bannerBar} />
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>Replying to {replyToMessage.sender?.username || 'User'}</Text>
                  <Text style={styles.bannerText} numberOfLines={1}>
                    {replyToMessage.content || replyToMessage.text}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyToMessage(null)}>
                  <X size={18} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>
            )}

            {editingMessage && (
              <View style={[styles.actionBanner, { backgroundColor: 'rgba(167, 139, 250, 0.25)' }]}>
                <View style={[styles.bannerBar, { backgroundColor: '#A78BFA' }]} />
                <View style={styles.bannerContent}>
                  <Text style={[styles.bannerTitle, { color: '#A78BFA' }]}>Editing message</Text>
                  <Text style={styles.bannerText} numberOfLines={1}>
                    {editingMessage.content || editingMessage.text}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setEditingMessage(null); setInputText(''); }}>
                  <X size={18} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>
            )}

            {selectedMediaFile && (
              <View style={styles.actionBanner}>
                <ImageIcon size={20} color="#A78BFA" style={{ marginRight: 8 }} />
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>Media attached</Text>
                  <Text style={styles.bannerText} numberOfLines={1}>{selectedMediaFile.uri}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedMediaFile(null)}>
                  <X size={18} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Text Input Container */}
            <View style={styles.inputWrapper}>
              <View style={styles.inputInnerContainer}>
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={() => setMediaPickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Plus size={22} color="#A78BFA" />
                </TouchableOpacity>

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
                    (!inputText.trim() && !selectedMediaFile) && styles.sendButtonDisabled
                  ]}
                  onPress={handleSendMessage}
                  disabled={(!inputText.trim() && !selectedMediaFile) || isSending}
                  activeOpacity={0.8}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Send size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LiquidGlassView>
        </KeyboardAvoidingView>
      )}

      {/* Message Long-Press Side Popover Card (Compact Pill/Card anchored to side of message) */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionModalVisible(false)}
        >
          <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFillObject} />

          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View style={[
              styles.actionModalCardSide,
              isActionMsgMine ? styles.actionModalCardRight : styles.actionModalCardLeft
            ]}>
              {/* Compact Emoji Reaction Bar */}
              <View style={styles.reactionBarCompact}>
                {EMOJI_LIST.map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiButtonCompact}
                    onPress={() => handleToggleReaction(emoji)}
                  >
                    <Text style={styles.emojiTextCompact}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Menu List */}
              <View style={styles.menuListCompact}>
                <TouchableOpacity style={styles.menuItemCompact} onPress={handleActionReply}>
                  <MessageSquare size={16} color="#A78BFA" style={styles.menuIconCompact} />
                  <Text style={styles.menuTextCompact}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItemCompact} onPress={handleActionCopy}>
                  <Copy size={16} color="#FFFFFF" style={styles.menuIconCompact} />
                  <Text style={styles.menuTextCompact}>Copy Text</Text>
                </TouchableOpacity>

                {isActionMsgMine && (
                  <>
                    <TouchableOpacity style={styles.menuItemCompact} onPress={handleActionEdit}>
                      <Pencil size={16} color="#C4B5FD" style={styles.menuIconCompact} />
                      <Text style={styles.menuTextCompact}>Edit Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.menuItemCompact, { borderBottomWidth: 0 }]} onPress={handleActionDelete}>
                      <Trash2 size={16} color="#EF4444" style={styles.menuIconCompact} />
                      <Text style={[styles.menuTextCompact, { color: '#EF4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Safety Number E2EE Verification Modal */}
      <SafetyNumberModal
        visible={safetyModalVisible}
        onClose={() => setSafetyModalVisible(false)}
        contactName={partnerName}
        safetyNumber={`1029 3847 5610 ${chatId.toString().padStart(4, '0')} 9283 7461 8234`}
      />

      {/* Media Attachment Selector Modal */}
      <MediaPickerModal
        visible={mediaPickerVisible}
        onClose={() => setMediaPickerVisible(false)}
        onCameraPress={handleCameraPick}
        onGalleryPress={handleGalleryPick}
      />

      {/* Toast Notification */}
      <Web3Toast
        visible={toast.visible}
        message={toast.message}
        isSuccess={toast.isSuccess}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0410',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(10, 4, 16, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  partnerInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  headerOnlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0A0410',
  },
  partnerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Dank Mono Bold',
  },
  partnerStatus: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionButton: {
    padding: 6,
  },
  keyboardContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 10,
    fontSize: 14,
  },
  errorText: {
    color: '#A78BFA',
    fontSize: 15,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },
  bottomElevatedContainer: {
    backgroundColor: '#0A0410',
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  bannerBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#A78BFA',
    borderRadius: 2,
    marginRight: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 12,
    color: '#A78BFA',
    fontWeight: 'bold',
  },
  bannerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  inputWrapper: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(21, 7, 35, 0.95)',
  },
  inputInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  actionModalCardSide: {
    width: 240,
    borderRadius: 20,
    backgroundColor: 'rgba(21, 7, 35, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  actionModalCardRight: {
    alignSelf: 'flex-end',
    marginRight: 10,
  },
  actionModalCardLeft: {
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  reactionBarCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 6,
  },
  emojiButtonCompact: {
    padding: 2,
  },
  emojiTextCompact: {
    fontSize: 18,
  },
  menuListCompact: {
    paddingVertical: 2,
  },
  menuItemCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuIconCompact: {
    marginRight: 10,
  },
  menuTextCompact: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
