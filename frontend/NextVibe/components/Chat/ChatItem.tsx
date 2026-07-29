import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Animated,
  useWindowDimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Trash2, BadgeCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import timeAgo from '@/src/utils/formatTime';
import ConfirmDialog from '../Shared/Toasts/ConfirmDialog';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';
import CryptoService from '@/src/services/CryptoService';
import { storage } from '@/src/utils/storage';

const DEFAULT_AVATAR = 'https://media.nextvibe.io/images/default.png';

interface ChatUser {
  user_id: number;
  username: string;
  avatar: string | null;
  is_online: boolean;
  official?: boolean;
}

export interface LastMessage {
  content?: string | null;
  text?: string | null;
  created_at?: string | null;
  media?: any[];
  media_attachments?: any[];
  media_keys?: any[];
}

export function formatLastMessagePreview(
  lastMessage: any,
  currentUserId?: number,
  otherUser?: ChatUser
): string {
  if (!lastMessage) return 'No messages yet';

  let text = (lastMessage.content || lastMessage.text || '').trim();

  // If text is encrypted JSON payload, mask raw JSON
  if (text.startsWith('{') && (text.includes('"ciphertext"') || text.includes('"sender_device_id"'))) {
    text = '🔒 Encrypted message';
  }

  const senderId = Number(lastMessage.sender_id || lastMessage.sender?.user_id || 0);
  const isMyMessage = currentUserId && senderId === currentUserId;

  // 1. Check for reactions on the message
  const reactions = lastMessage.reactions || [];
  if (Array.isArray(reactions) && reactions.length > 0) {
    if (isMyMessage) {
      const otherReaction = reactions.find((r: any) => !r.reacted_by_me || (r.user_id && r.user_id !== currentUserId));
      if (otherReaction) {
        return `Reacted ${otherReaction.emoji} to your message`;
      }
    } else {
      const myReaction = reactions.find((r: any) => r.reacted_by_me);
      if (myReaction) {
        return `You reacted ${myReaction.emoji} to message`;
      }
    }
  }

  // 2. Format media labels if attachments are present
  const mediaList = lastMessage.media || lastMessage.media_attachments || lastMessage.media_keys || [];
  let mediaLabel = '';
  if (Array.isArray(mediaList) && mediaList.length > 0) {
    const count = mediaList.length;
    const firstItem = mediaList[0];
    const isVideo =
      (typeof firstItem === 'object' &&
        (firstItem.type?.includes('video') ||
          firstItem.file_url?.endsWith('.mp4') ||
          firstItem.file?.endsWith('.mp4'))) ||
      false;

    mediaLabel = isVideo
      ? count > 1
        ? `🎥 ${count} videos`
        : '🎥 Video'
      : count > 1
      ? `📷 ${count} photos`
      : '📷 Photo';

    text = text ? `${mediaLabel} ${text}` : mediaLabel;
  } else if (text.startsWith('http') && (text.endsWith('.jpg') || text.endsWith('.png') || text.endsWith('.mp4'))) {
    text = text.endsWith('.mp4') ? '🎥 Video' : '📷 Photo';
  }

  if (!text) text = 'No messages yet';

  // 3. Handle My Message status prefix (Seen vs You: {text})
  if (isMyMessage) {
    const isRead = Boolean(
      lastMessage.is_read ||
      lastMessage.read_at ||
      (lastMessage.receipts && lastMessage.receipts.some((r: any) => r.user_id !== currentUserId && r.read_at))
    );

    if (isRead) {
      const readTimestamp = lastMessage.read_at || lastMessage.receipts?.find((r: any) => r.read_at)?.read_at || lastMessage.created_at;
      const seenTimeStr = readTimestamp ? timeAgo(readTimestamp) : '';
      return seenTimeStr ? `Seen • ${seenTimeStr}` : `Seen • ${text}`;
    }

    return `You: ${text}`;
  }

  return text;
}

export interface Chat {
  chat_id: number;
  other_user: ChatUser;
  last_message: LastMessage | null;
  unread_count?: number;
  unread_messages_count?: number;
  unread_count_user?: number;
}

interface ChatItemProps {
  chat: Chat;
  onDelete: (chatId: number) => boolean | Promise<boolean>;
}

export default function ChatItem({ chat, onDelete }: ChatItemProps) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];

  const [isPressed, setIsPressed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', isSuccess: false });

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const styles = getStyles(isDark, colors);

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPressed(true);
    Animated.spring(translateX, {
      toValue: -80,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleDeletePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowConfirmDialog(true);
  };

  const confirmDelete = async () => {
    setShowConfirmDialog(false);
    setIsDeleting(true);

    try {
      const deleted = await onDelete(chat.chat_id);

      if (deleted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setToast({
          visible: true,
          message: 'Chat deleted successfully',
          isSuccess: true,
        });

        Animated.parallel([
          Animated.timing(translateX, {
            toValue: -screenWidth,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setToast({
          visible: true,
          message: 'Failed to delete chat',
          isSuccess: false,
        });
        resetPosition();
      }
    } catch (error) {
      console.error('Delete error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setToast({
        visible: true,
        message: 'An error occurred while deleting',
        isSuccess: false,
      });
      resetPosition();
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowConfirmDialog(false);
    resetPosition();
  };

  const resetPosition = () => {
    setIsPressed(false);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePress = () => {
    if (isPressed) {
      resetPosition();
    } else {
      router.push({
        pathname: '/(shared)/chat-room',
        params: { id: chat.chat_id, userId: chat.other_user.user_id },
      });
    }
  };

  const [currentUserId, setCurrentUserId] = useState<number | undefined>(undefined);
  const [decryptedPreviewText, setDecryptedPreviewText] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserId = async () => {
      const storedId = await storage.getItem('id');
      if (storedId) setCurrentUserId(Number(storedId));
    };
    fetchUserId();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const decryptLastMsg = async () => {
      const rawText = (chat.last_message?.content || chat.last_message?.text || '').trim();
      if (!rawText) {
        if (isMounted) setDecryptedPreviewText(null);
        return;
      }

      if (rawText.startsWith('{') && (rawText.includes('"ciphertext"') || rawText.includes('"sender_device_id"'))) {
        try {
          const storedUserId = await storage.getItem('id');
          const uid = storedUserId ? Number(storedUserId) : 0;
          const senderId = (chat.last_message as any)?.sender_id || chat.other_user?.user_id || 0;
          const decrypted = await CryptoService.decryptMessage(
            uid,
            senderId,
            rawText,
            chat.other_user?.user_id
          );
          if (isMounted) setDecryptedPreviewText(decrypted);
        } catch {
          if (isMounted) setDecryptedPreviewText('🔒 Encrypted message');
        }
      } else {
        if (isMounted) setDecryptedPreviewText(rawText);
      }
    };

    decryptLastMsg();
    return () => {
      isMounted = false;
    };
  }, [chat.last_message?.content, chat.last_message?.text, chat.other_user?.user_id]);

  const activeLastMessage = decryptedPreviewText !== null
    ? { ...chat.last_message, content: decryptedPreviewText, text: decryptedPreviewText }
    : chat.last_message;

  const messageContent = formatLastMessagePreview(activeLastMessage, currentUserId, chat.other_user);
  const messageTime = chat.last_message?.created_at ? timeAgo(chat.last_message.created_at) : '';
  const avatarUri = chat.other_user.avatar || DEFAULT_AVATAR;

  const unreadCount =
    chat.unread_count ||
    (chat as any).unread_messages_count ||
    (chat as any).unread_count_user ||
    (chat as any).unread ||
    0;

  return (
    <>
      <TouchableWithoutFeedback onPress={isPressed ? resetPosition : undefined}>
        <Animated.View style={[styles.wrapper, { opacity }]}>
          {isPressed && (
            <TouchableOpacity
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={styles.deleteButton}
              onPress={handleDeletePress}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Text style={styles.deletingText}>Deleting...</Text>
              ) : (
                <Trash2 size={24} color="#fff" />
              )}
            </TouchableOpacity>
          )}

          <Animated.View style={{ transform: [{ translateX }] }}>
            <TouchableOpacity
              style={styles.container}
              onPress={handlePress}
              onLongPress={handleLongPress}
              delayLongPress={350}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              <BlurView
                intensity={isDark ? 20 : 40}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurBackground}
              />

              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={200}
                />
                {chat.other_user.is_online && (
                  <View style={[styles.onlineIndicator, { borderColor: isDark ? colors.bg : '#FFFFFF' }]} />
                )}
              </View>

              <View style={styles.contentContainer}>
                <View style={styles.header}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
                      {chat.other_user.username}
                    </Text>
                    {chat.other_user.official && (
                      <BadgeCheck size={16} color={colors.accent} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text style={[styles.time, { color: unreadCount > 0 ? colors.accent : colors.subtext, fontWeight: unreadCount > 0 ? '700' : '400' }]}>
                    {messageTime}
                  </Text>
                </View>

                <View style={styles.messageContainer}>
                  <Text
                    style={[
                      styles.message,
                      {
                        color: unreadCount > 0 ? colors.text : colors.subtext,
                        fontWeight: unreadCount > 0 ? '600' : '400',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {messageContent}
                  </Text>
                  {unreadCount > 0 && (
                    <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.unreadText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>

      <ConfirmDialog
        visible={showConfirmDialog}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        title="Delete Chat?"
        message={`Are you sure you want to delete chat with ${chat.other_user.username}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmGradient={['#EF4444', '#DC2626']}
        iconName="delete-alert"
        iconColor="#FCA5A5"
      />

      <Web3Toast
        visible={toast.visible}
        message={toast.message}
        isSuccess={toast.isSuccess}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </>
  );
}

const getStyles = (isDark: boolean, colors: typeof chatColors.dark) =>
  StyleSheet.create({
    wrapper: {
      position: 'relative',
      overflow: 'hidden',
    },
    container: {
      flexDirection: 'row',
      padding: 14,
      paddingHorizontal: 16,
      marginHorizontal: 10,
      marginVertical: 4,
      borderRadius: chatRadius.card,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? 'rgba(21, 7, 35, 0.4)' : 'rgba(255, 255, 255, 0.75)',
      overflow: 'hidden',
      zIndex: 1,
    },
    blurBackground: {
      ...StyleSheet.absoluteFillObject,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 13,
      height: 13,
      borderRadius: 6.5,
      backgroundColor: colors.success,
      borderWidth: 2,
    },
    contentContainer: {
      flex: 1,
      marginLeft: 14,
      justifyContent: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    username: {
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'Dank Mono Bold',
      includeFontPadding: false,
    },
    time: {
      fontSize: 12,
    },
    messageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    message: {
      flex: 1,
      fontSize: 14,
      marginRight: 5,
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 6,
    },
    unreadText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: 'bold',
    },
    deleteButton: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 80,
      backgroundColor: '#ef4444',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 0,
    },
    deletingText: {
      color: '#fff',
      fontSize: 12,
      fontFamily: 'Dank Mono Bold',
      includeFontPadding: false,
    },
  });