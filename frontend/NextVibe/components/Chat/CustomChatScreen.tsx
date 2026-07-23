import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  useColorScheme,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
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
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { storage } from '@/src/utils/storage';
import {
  getMessages,
  sendWebSocketMessage,
  markChatAsRead,
  sendTypingStart,
  sendTypingStop,
  addReaction,
  removeReaction,
  editMessage,
  deleteMessage,
  getChats,
} from '@/src/api/chat';
import WebSocketService from '@/src/services/WebSocketService';
import ChatBubble from './ChatBubble';
import P2PStatusBadge from './P2PStatusBadge';
import ChatTransportManager from '@/src/services/ChatTransport';
import SafetyNumberModal from './SafetyNumberModal';
import MediaPickerModal from './MediaPickerModal';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import { LiquidGlassView } from '../Shared/LiquidGlassView';
import { chatColors, chatRadius, chatSpacing } from '@/src/theme/chatTheme';

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

interface DateSeparatorItem {
  type: 'date_separator';
  id: string;
  dateString: string;
}

type ListItem = (MessageItem & { type?: 'message' }) | DateSeparatorItem;

function formatDateSeparator(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (msgDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (msgDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  } catch {
    return '';
  }
}

export default function CustomChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
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

  // Memoized dynamic styles
  const styles = useMemo(() => getStyles(isDark, insets, colors), [isDark, insets, colors]);

  // Fetch current user ID & Partner Info
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

  // Fetch history from REST endpoint
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

        if (!otherUser && data.length > 0) {
          const msgFromOther = data.find(m => m.sender_id && m.sender_id !== currentUserId);
          if (msgFromOther && msgFromOther.sender) {
            setOtherUser({
              user_id: msgFromOther.sender.user_id || msgFromOther.sender_id || 0,
              username: msgFromOther.sender.username || 'User',
              avatar: msgFromOther.sender.avatar || null,
              is_online: false,
              official: msgFromOther.sender.official,
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

  // Pagination
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

  // Real-time subscriptions
  useEffect(() => {
    if (!chatId || !isFocused) return;

    loadInitialMessages();
    markChatAsRead(chatId);

    const unsubscribeTransport = ChatTransportManager.addListener({
      onTransportStateChange: (cId, state) => {
        if (cId === chatId) setTransportType(state);
      },
      onMessageReceived: (incoming) => {
        if (incoming.chat_id === chatId) {
          setMessages(prev => deduplicateMessages([incoming, ...prev]));
        }
      },
    });

    const unsubscribeWS = WebSocketService.addListener((event: any) => {
      if (!event || String(event.chat_id) !== String(chatId)) return;

      if (event.type === 'message') {
        if (event.sender_id && event.sender_id !== currentUserId) {
          markChatAsRead(chatId);
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
            const isMatch = Array.isArray(event.message_ids)
              ? (event.message_ids.length > 0 && event.message_ids.some((id: any) => String(id) === String(msgId)))
              : true;
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
                  read_at: event.read_at || new Date().toISOString(),
                });
              }
              const isReadByRecipient = Boolean(
                event.reader_id &&
                event.reader_id !== currentUserId &&
                (msg.sender_id === currentUserId || (msg.sender && msg.sender.user_id === currentUserId))
              );
              return { ...msg, is_read: msg.is_read || isReadByRecipient, receipts: updatedReceipts };
            }
            return msg;
          })
        );
      } else if (event.type === 'reaction_update') {
        const targetMsgId = String(event.message_id || event.server_msg_id);
        setMessages(prev =>
          prev.map(msg => {
            const mServerId = msg.server_msg_id ? String(msg.server_msg_id) : null;
            const mMsgId = (msg as any).message_id ? String((msg as any).message_id) : null;
            const mId = msg.id ? String(msg.id) : null;
            const mClientId = msg.client_msg_id ? String(msg.client_msg_id) : null;

            if (
              (mServerId && mServerId === targetMsgId) ||
              (mMsgId && mMsgId === targetMsgId) ||
              (mId && mId === targetMsgId) ||
              (mClientId && mClientId === targetMsgId)
            ) {
              return { ...msg, reactions: event.reactions };
            }
            return msg;
          })
        );
      } else if (event.type === 'typing_status') {
        if (event.user_id !== currentUserId) {
          setIsTyping(event.is_typing);
        }
      } else if (event.type === 'message_edited' || event.type === 'edit_message') {
        const targetId = String(event.server_msg_id || event.message_id || event.id);
        const updatedText = event.content || event.text;
        setMessages(prev =>
          prev.map(msg => {
            const msgId = String(msg.server_msg_id || (msg as any).message_id || msg.id || msg.client_msg_id);
            if (msgId === targetId || (msg.server_msg_id && String(msg.server_msg_id) === targetId)) {
              return {
                ...msg,
                text: updatedText || msg.text || msg.content,
                content: updatedText || msg.content || msg.text,
                edited_at: event.edited_at || new Date().toISOString(),
              };
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
      markChatAsRead(chatId);
      unsubscribeWS();
      unsubscribeTransport();
    };
  }, [chatId, isFocused, currentUserId, loadInitialMessages]);

  // Input Typing Indicator
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!chatId) return;

    sendTypingStart(chatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop(chatId);
    }, 3000);
  };

  // Media Selection Handlers
  const handleCameraPick = async () => {
    setMediaPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

  // Send Message / Save Edit Action
  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedMediaFile) || !chatId || isSending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const messageText = inputText.trim();
    setInputText('');
    const mediaToSend = selectedMediaFile;
    setSelectedMediaFile(null);
    setIsSending(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingStop(chatId);

    // If Editing existing message
    if (editingMessage) {
      const rawMsgId = editingMessage.server_msg_id || (editingMessage as any).message_id || editingMessage.id;
      const numMsgId = Number(rawMsgId);

      setMessages(prev =>
        prev.map(m => {
          const mKey = String(m.server_msg_id || (m as any).message_id || m.id || m.client_msg_id);
          if (mKey === String(rawMsgId) || (!isNaN(numMsgId) && (m.server_msg_id === numMsgId || (m as any).message_id === numMsgId))) {
            return {
              ...m,
              text: messageText,
              content: messageText,
              edited_at: new Date().toISOString(),
            };
          }
          return m;
        })
      );

      try {
        await editMessage(chatId, numMsgId, messageText);
        setToast({ visible: true, message: 'Message edited', isSuccess: true });
      } catch (err: any) {
        console.error('Failed to edit message:', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const errDetail = err?.response?.data?.detail || err?.message || 'Failed to edit message';
        setToast({ visible: true, message: errDetail, isSuccess: false });
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
        text: replyToMessage.content || replyToMessage.text || '',
      } : null,
      sender: {
        user_id: currentUserId,
        username: 'Me',
      },
    };

    setReplyToMessage(null);
    setMessages(prev => deduplicateMessages([optimisticMsg, ...prev]));

    try {
      const mediaList = mediaToSend ? [mediaToSend] : [];
      await sendWebSocketMessage(chatId, messageText, mediaList, replyToId ? Number(replyToId) : undefined, clientMsgId);
    } catch (err) {
      console.error('[CustomChatScreen] Error sending message:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessages(prev => prev.filter(m => m.id !== clientMsgId && m.client_msg_id !== clientMsgId));
      setInputText(messageText);
    } finally {
      setIsSending(false);
    }
  };

  // Reaction / Action Menu Handlers
  const handleMessageLongPress = useCallback((msg: MessageItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedActionMessage(msg);
    setActionModalVisible(true);
  }, []);

  const handleToggleReaction = useCallback(async (emoji: string) => {
    if (!selectedActionMessage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const rawMsgId = selectedActionMessage.server_msg_id || (selectedActionMessage as any).message_id || selectedActionMessage.id;
    const numMsgId = Number(rawMsgId);
    setActionModalVisible(false);

    if (isNaN(numMsgId)) return;

    let isRemoving = false;
    setMessages(prev =>
      prev.map(msg => {
        const mKey = String(msg.server_msg_id || (msg as any).message_id || msg.id || msg.client_msg_id);
        if (mKey === String(rawMsgId) || (!isNaN(numMsgId) && (msg.server_msg_id === numMsgId || (msg as any).message_id === numMsgId))) {
          const currentReactions = msg.reactions || [];
          const existingIdx = currentReactions.findIndex(r => r.emoji === emoji);
          let newReactions = [...currentReactions];

          if (existingIdx !== -1) {
            const existing = newReactions[existingIdx];
            if (existing.reacted_by_me) {
              isRemoving = true;
              if (existing.count <= 1) {
                newReactions.splice(existingIdx, 1);
              } else {
                newReactions[existingIdx] = { ...existing, count: existing.count - 1, reacted_by_me: false };
              }
            } else {
              newReactions[existingIdx] = { ...existing, count: existing.count + 1, reacted_by_me: true };
            }
          } else {
            newReactions.push({ emoji, count: 1, reacted_by_me: true });
          }
          return { ...msg, reactions: newReactions };
        }
        return msg;
      })
    );

    try {
      if (isRemoving) {
        await removeReaction(chatId, numMsgId, emoji);
      } else {
        await addReaction(chatId, numMsgId, emoji);
      }
    } catch (err) {
      console.error('Failed to update reaction:', err);
    }
  }, [selectedActionMessage, chatId]);

  const handleActionReply = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedActionMessage) {
      setReplyToMessage(selectedActionMessage);
    }
    setActionModalVisible(false);
  }, [selectedActionMessage]);

  const handleActionCopy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedActionMessage && (selectedActionMessage.content || selectedActionMessage.text)) {
      Clipboard.setStringAsync(selectedActionMessage.content || selectedActionMessage.text || '');
      setToast({ visible: true, message: 'Message copied', isSuccess: true });
    }
    setActionModalVisible(false);
  }, [selectedActionMessage]);

  const handleActionEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedActionMessage) {
      setEditingMessage(selectedActionMessage);
      setInputText(selectedActionMessage.content || selectedActionMessage.text || '');
    }
    setActionModalVisible(false);
  }, [selectedActionMessage]);

  const handleActionDelete = useCallback(async () => {
    if (!selectedActionMessage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const msgId = selectedActionMessage.server_msg_id || (selectedActionMessage as any).message_id || selectedActionMessage.id;
    setActionModalVisible(false);
    try {
      await deleteMessage(chatId, Number(msgId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({ visible: true, message: 'Message deleted', isSuccess: true });
    } catch (err) {
      console.error('Failed to delete message:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [selectedActionMessage, chatId]);

  const partnerName = otherUser?.username || 'User';
  const partnerAvatar = otherUser?.avatar || DEFAULT_AVATAR;

  const isActionMsgMine = selectedActionMessage && (
    selectedActionMessage.sender_id === currentUserId ||
    selectedActionMessage.sender?.user_id === currentUserId
  );

  // Process message list for Date Separators & Sequence Grouping
  const processedListItems = useMemo(() => {
    const items: ListItem[] = [];
    const count = messages.length;

    for (let i = 0; i < count; i++) {
      const msg = messages[i];
      const prevMsg = messages[i - 1]; // Newer message (below on screen)
      const nextMsg = messages[i + 1]; // Older message (above on screen)

      // Add the message item itself
      items.push(msg);

      // Check date separator: insert separator after msg if next (older) msg is on a different calendar day or doesn't exist
      const currentDateStr = msg.created_at ? new Date(msg.created_at).toDateString() : '';
      const nextDateStr = nextMsg && nextMsg.created_at ? new Date(nextMsg.created_at).toDateString() : '';

      if (!nextMsg || (currentDateStr && nextDateStr && currentDateStr !== nextDateStr)) {
        if (msg.created_at) {
          items.push({
            type: 'date_separator',
            id: `date_sep_${msg.id || i}`,
            dateString: formatDateSeparator(msg.created_at),
          });
        }
      }
    }
    return items;
  }, [messages]);

  // Render FlatList Item
  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => {
      if (item.type === 'date_separator') {
        return (
          <View style={styles.dateSeparatorWrapper}>
            <View style={styles.dateSeparatorBadge}>
              <Text style={styles.dateSeparatorText}>{(item as DateSeparatorItem).dateString}</Text>
            </View>
          </View>
        );
      }

      const msg = item as MessageItem;
      const prevItem = processedListItems[index - 1]; // Newer item (below on screen)
      const nextItem = processedListItems[index + 1]; // Older item (above on screen)

      const prevMsg = prevItem && prevItem.type !== 'date_separator' ? (prevItem as MessageItem) : null;
      const nextMsg = nextItem && nextItem.type !== 'date_separator' ? (nextItem as MessageItem) : null;

      const currentSenderId = msg.sender_id || msg.sender?.user_id;

      // Grouped above if older message exists, same sender, and created within 60s
      const isGroupedAbove = Boolean(
        nextMsg &&
        (nextMsg.sender_id || nextMsg.sender?.user_id) === currentSenderId &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(nextMsg.created_at).getTime()) < 60000
      );

      // Grouped below if newer message exists, same sender, and created within 60s
      const isGroupedBelow = Boolean(
        prevMsg &&
        (prevMsg.sender_id || prevMsg.sender?.user_id) === currentSenderId &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 60000
      );

      const isLastInGroup = !isGroupedBelow;

      return (
        <ChatBubble
          message={msg as any}
          isGroupedAbove={isGroupedAbove}
          isGroupedBelow={isGroupedBelow}
          isLastInGroup={isLastInGroup}
          onLongPress={() => handleMessageLongPress(msg)}
          onReply={() => setReplyToMessage(msg)}
          onReactionPress={(msgId, emoji) => {
            const numId = Number(msgId);
            if (isNaN(numId)) return;

            const targetMsg = messages.find(m => {
              const mKey = String(m.server_msg_id || (m as any).message_id || m.id || m.client_msg_id);
              return mKey === String(msgId) || (m.server_msg_id === numId || (m as any).message_id === numId);
            });
            const existingReaction = targetMsg?.reactions?.find(r => r.emoji === emoji);
            const isRemoving = Boolean(existingReaction && existingReaction.reacted_by_me);

            setMessages(prev =>
              prev.map(m => {
                const mKey = String(m.server_msg_id || (m as any).message_id || m.id || m.client_msg_id);
                if (mKey === String(msgId) || (m.server_msg_id === numId || (m as any).message_id === numId)) {
                  const currentReactions = m.reactions || [];
                  const existingIdx = currentReactions.findIndex(r => r.emoji === emoji);
                  let newReactions = [...currentReactions];

                  if (existingIdx !== -1) {
                    const existing = newReactions[existingIdx];
                    if (existing.reacted_by_me) {
                      if (existing.count <= 1) {
                        newReactions.splice(existingIdx, 1);
                      } else {
                        newReactions[existingIdx] = { ...existing, count: existing.count - 1, reacted_by_me: false };
                      }
                    } else {
                      newReactions[existingIdx] = { ...existing, count: existing.count + 1, reacted_by_me: true };
                    }
                  } else {
                    newReactions.push({ emoji, count: 1, reacted_by_me: true });
                  }
                  return { ...m, reactions: newReactions };
                }
                return m;
              })
            );

            if (isRemoving) {
              removeReaction(chatId, numId, emoji);
            } else {
              addReaction(chatId, numId, emoji);
            }
          }}
        />
      );
    },
    [processedListItems, messages, handleMessageLongPress]
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />

      {/* Modern Clean Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.text} />
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
            {otherUser?.is_online && (
              <View style={[styles.headerOnlineIndicator, { borderColor: colors.bg }]} />
            )}
          </View>

          <View style={styles.partnerTextCol}>
            <View style={styles.nameRow}>
              <Text style={[styles.partnerName, { color: colors.text }]} numberOfLines={1}>
                {partnerName}
              </Text>
              {otherUser?.official && (
                <BadgeCheck size={16} color={colors.accent} style={{ marginLeft: 4 }} />
              )}
            </View>
            <Text style={[styles.partnerStatus, { color: colors.subtext }]}>
              {isTyping ? 'typing...' : otherUser?.is_online ? 'Online' : 'Encrypted Chat'}
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
            <ShieldCheck size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.subtext }]}>Loading chat history...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.accent }]}>{errorMsg}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.accent }]} onPress={loadInitialMessages}>
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
            data={processedListItems}
            keyExtractor={(item, index) =>
              item.type === 'date_separator'
                ? item.id
                : String(item.server_msg_id || item.id || item.client_msg_id || `msg_${index}`)
            }
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            maxToRenderPerBatch={12}
            windowSize={10}
            initialNumToRender={15}
            removeClippedSubviews={Platform.OS === 'android'}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 8 }} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(167, 139, 250, 0.12)' : 'rgba(124, 58, 237, 0.08)' }]}>
                  <Sparkles size={32} color={colors.accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
                  Send a message or media attachment to start chatting with {partnerName}!
                </Text>
              </View>
            }
          />

          {/* Floating Liquid Glass Bottom Capsule */}
          <View style={[styles.floatingBottomWrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <LiquidGlassView
              glassEffectStyle="clear"
              colorScheme="auto"
              fallbackBackgroundColor="transparent"
              style={[
                styles.floatingGlassCapsule,
                {
                  borderColor: isDark ? 'rgba(167, 139, 250, 0.3)' : 'rgba(124, 58, 237, 0.25)',
                  backgroundColor: isDark ? 'rgba(21, 7, 35, 0.85)' : 'rgba(255, 255, 255, 0.92)',
                },
              ]}
            >
              {/* Action Banners */}
              {replyToMessage && (
                <View style={[styles.actionBanner, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                  <View style={[styles.bannerBar, { backgroundColor: colors.accent }]} />
                  <View style={styles.bannerContent}>
                    <Text style={[styles.bannerTitle, { color: colors.accent }]}>Replying to {replyToMessage.sender?.username || 'User'}</Text>
                    <Text style={[styles.bannerText, { color: colors.subtext }]} numberOfLines={1}>
                      {replyToMessage.content || replyToMessage.text}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyToMessage(null)}>
                    <X size={18} color={colors.subtext} />
                  </TouchableOpacity>
                </View>
              )}

              {editingMessage && (
                <View style={[styles.actionBanner, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(124, 58, 237, 0.08)' }]}>
                  <View style={[styles.bannerBar, { backgroundColor: colors.accent }]} />
                  <View style={styles.bannerContent}>
                    <Text style={[styles.bannerTitle, { color: colors.accent }]}>Editing message</Text>
                    <Text style={[styles.bannerText, { color: colors.subtext }]} numberOfLines={1}>
                      {editingMessage.content || editingMessage.text}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setEditingMessage(null); setInputText(''); }}>
                    <X size={18} color={colors.subtext} />
                  </TouchableOpacity>
                </View>
              )}

              {selectedMediaFile && (
                <View style={[styles.actionBanner, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                  <ImageIcon size={20} color={colors.accent} style={{ marginRight: 8 }} />
                  <View style={styles.bannerContent}>
                    <Text style={[styles.bannerTitle, { color: colors.accent }]}>Media attached</Text>
                    <Text style={[styles.bannerText, { color: colors.subtext }]} numberOfLines={1}>{selectedMediaFile.uri}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMediaFile(null)}>
                    <X size={18} color={colors.subtext} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Text Input Inner Container */}
              <View style={styles.inputWrapper}>
                <View style={styles.inputInnerContainer}>
                  <TouchableOpacity
                    style={styles.attachButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMediaPickerVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Plus size={22} color={colors.accent} />
                  </TouchableOpacity>

                  <TextInput
                    style={[styles.textInput, { color: colors.text, maxHeight: 100 }]}
                    value={inputText}
                    onChangeText={handleInputChange}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.subtext}
                    multiline
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                  />

                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      { backgroundColor: colors.accent },
                      (!inputText.trim() && !selectedMediaFile) && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSendMessage}
                    disabled={(!inputText.trim() && !selectedMediaFile) || isSending}
                    activeOpacity={0.8}
                  >
                    {isSending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Send size={17} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </LiquidGlassView>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Message Long-Press Side Popover Card */}
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
          <BlurView intensity={65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />

          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View
              style={[
                styles.actionModalCardSide,
                {
                  backgroundColor: colors.cardBg,
                  borderColor: colors.border,
                },
                isActionMsgMine ? styles.actionModalCardRight : styles.actionModalCardLeft,
              ]}
            >
              {/* Compact Emoji Reaction Bar */}
              <View style={[styles.reactionBarCompact, { borderBottomColor: colors.divider }]}>
                {EMOJI_LIST.map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiButtonCompact}
                    onPress={() => handleToggleReaction(emoji)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.emojiTextCompact}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Menu List */}
              <View style={styles.menuListCompact}>
                <TouchableOpacity style={[styles.menuItemCompact, { borderBottomColor: colors.divider }]} onPress={handleActionReply}>
                  <MessageSquare size={16} color={colors.accent} style={styles.menuIconCompact} />
                  <Text style={[styles.menuTextCompact, { color: colors.text }]}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItemCompact, { borderBottomColor: colors.divider }]} onPress={handleActionCopy}>
                  <Copy size={16} color={colors.text} style={styles.menuIconCompact} />
                  <Text style={[styles.menuTextCompact, { color: colors.text }]}>Copy Text</Text>
                </TouchableOpacity>

                {isActionMsgMine && (
                  <>
                    <TouchableOpacity style={[styles.menuItemCompact, { borderBottomColor: colors.divider }]} onPress={handleActionEdit}>
                      <Pencil size={16} color={colors.accent} style={styles.menuIconCompact} />
                      <Text style={[styles.menuTextCompact, { color: colors.text }]}>Edit Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.menuItemCompact, { borderBottomWidth: 0 }]} onPress={handleActionDelete}>
                      <Trash2 size={16} color={colors.danger} style={styles.menuIconCompact} />
                      <Text style={[styles.menuTextCompact, { color: colors.danger }]}>Delete</Text>
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

const getStyles = (
  isDark: boolean,
  insets: any,
  colors: typeof chatColors.dark
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingBottom: 12,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      backgroundColor: colors.success,
      borderWidth: 2,
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
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'Dank Mono Bold',
    },
    partnerStatus: {
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
      marginTop: 10,
      fontSize: 14,
    },
    errorText: {
      fontSize: 15,
      marginBottom: 12,
    },
    retryButton: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 12,
    },
    retryButtonText: {
      color: '#FFFFFF',
      fontWeight: 'bold',
    },
    dateSeparatorWrapper: {
      alignItems: 'center',
      marginVertical: 12,
    },
    dateSeparatorBadge: {
      backgroundColor: colors.dateBadgeBg,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    dateSeparatorText: {
      color: colors.dateBadgeText,
      fontSize: 11,
      fontWeight: '600',
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: 'Dank Mono Bold',
      marginBottom: 6,
    },
    emptySubtext: {
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260,
    },
    floatingBottomWrapper: {
      paddingHorizontal: 12,
      backgroundColor: 'transparent',
    },
    floatingGlassCapsule: {
      borderRadius: chatRadius.modal,
      borderWidth: 1,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    actionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    bannerBar: {
      width: 3,
      height: '100%',
      borderRadius: 2,
      marginRight: 10,
    },
    bannerContent: {
      flex: 1,
    },
    bannerTitle: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    bannerText: {
      fontSize: 12,
    },
    inputWrapper: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: 'transparent',
    },
    inputInnerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    attachButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 6,
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: 'transparent',
      marginRight: 6,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
      borderRadius: chatRadius.card,
      borderWidth: 1,
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
    },
    menuIconCompact: {
      marginRight: 10,
    },
    menuTextCompact: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
