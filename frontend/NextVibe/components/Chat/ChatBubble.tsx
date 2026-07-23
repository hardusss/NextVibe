import React, { useEffect, useState, memo } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Check, CheckCheck } from 'lucide-react-native';
import MediaGrid from './MediaGrid';
import { storage } from '@/src/utils/storage';
import { chatColors, chatRadius, chatSpacing, chatTypography } from '@/src/theme/chatTheme';

interface MediaAttachment {
  id: number;
  file_url: string | null;
  preview_url?: string | null;
  isTemp?: boolean;
}

interface ReactionSummary {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

interface Receipt {
  user_id: number;
  delivered_at: string | null;
  read_at: string | null;
}

interface ReplySnippet {
  id: number;
  sender_id: number;
  sender_name: string;
  text: string;
  is_deleted?: boolean;
}

export interface Message {
  message_id: number;
  server_msg_id?: number;
  client_msg_id?: string;
  content: string;
  sender_id: number;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: number | null;
  reply_to_snippet?: ReplySnippet | null;
  is_read: boolean;
  media: MediaAttachment[];
  reactions?: ReactionSummary[];
  receipts?: Receipt[];
}

interface Props {
  message: Message;
  isGroupedAbove?: boolean;
  isGroupedBelow?: boolean;
  isLastInGroup?: boolean;
  onReply?: (message: Message) => void;
  onReactionPress?: (messageId: number, emoji: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: number) => void;
  onLongPress?: (message: Message) => void;
}

function formatMessageTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}

const ChatBubbleComponent: React.FC<Props> = ({
  message,
  isGroupedAbove = false,
  isGroupedBelow = false,
  isLastInGroup = true,
  onReply,
  onReactionPress,
  onEdit,
  onDelete,
  onLongPress,
}) => {
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const { width: screenWidth } = useWindowDimensions();
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const getId = async () => {
      const id = await storage.getItem('id');
      if (id) setUserId(Number(id));
    };
    getId();
  }, []);

  if (userId === null) {
    return null;
  }

  const isMyMessage = message.sender_id === userId;
  const isDeleted = !!message.deleted_at;

  const handleLongPress = () => {
    if (message.deleted_at) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onLongPress) {
      onLongPress(message);
    } else if (onReply) {
      onReply(message);
    } else if (message.content) {
      Clipboard.setStringAsync(message.content);
    }
  };

  const handleReactionClick = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onReactionPress) {
      const msgId = message.server_msg_id || message.message_id || (message as any).id;
      onReactionPress(msgId, emoji);
    }
  };

  // Receipt status indicator logic
  const getReceiptStatus = () => {
    if (!isMyMessage) return null;

    if (message.is_read) {
      return <CheckCheck size={14} color={colors.readReceipt} style={styles.checkIcon} />;
    }

    const recipientReceipts = (message.receipts || []).filter((r) => r.user_id !== userId);

    if (recipientReceipts.length > 0) {
      const allRead = recipientReceipts.every((r) => r.read_at !== null);
      if (allRead) {
        return <CheckCheck size={14} color={colors.readReceipt} style={styles.checkIcon} />;
      }
      const anyDelivered = recipientReceipts.some((r) => r.delivered_at !== null);
      if (anyDelivered) {
        return <CheckCheck size={14} color={colors.deliveredReceipt} style={styles.checkIcon} />;
      }
    }

    return <Check size={14} color={colors.deliveredReceipt} style={styles.checkIcon} />;
  };

  // Calculate dynamic border radii based on message sequence grouping
  const getBubbleBorderRadius = () => {
    const defaultRadius = chatRadius.bubble; // 18
    const tailRadius = chatRadius.bubbleTail;  // 6

    if (isMyMessage) {
      return {
        borderTopLeftRadius: defaultRadius,
        borderTopRightRadius: isGroupedAbove ? tailRadius : defaultRadius,
        borderBottomLeftRadius: defaultRadius,
        borderBottomRightRadius: isGroupedBelow ? tailRadius : defaultRadius,
      };
    } else {
      return {
        borderTopLeftRadius: isGroupedAbove ? tailRadius : defaultRadius,
        borderTopRightRadius: defaultRadius,
        borderBottomLeftRadius: isGroupedBelow ? tailRadius : defaultRadius,
        borderBottomRightRadius: defaultRadius,
      };
    }
  };

  const maxBubbleWidth = Math.min(screenWidth * 0.82, 420);
  const styles = getStyles(isDark, isMyMessage, colors);

  return (
    <View
      style={[
        styles.container,
        isMyMessage ? styles.rightAlign : styles.leftAlign,
        { marginBottom: isGroupedBelow ? 3 : 10 },
      ]}
    >
      <View
        style={[
          styles.messageContainer,
          { maxWidth: maxBubbleWidth },
          getBubbleBorderRadius(),
        ]}
      >
        <BlurView
          intensity={isMyMessage ? (isDark ? 30 : 60) : (isDark ? 25 : 95)}
          tint={isMyMessage ? 'dark' : (isDark ? 'dark' : 'light')}
          style={styles.blurViewAbsolute}
        />
        {isMyMessage && <View style={styles.myMessageTint} />}

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.messageContent}
          onLongPress={handleLongPress}
          delayLongPress={280}
          activeOpacity={0.85}
        >
          {/* Reply Quote Preview */}
          {message.reply_to_snippet && (
            <View style={styles.replyPreviewCard}>
              <View style={styles.replyBar} />
              <View style={styles.replyContent}>
                <Text style={styles.replySender}>{message.reply_to_snippet.sender_name}</Text>
                <Text numberOfLines={1} style={styles.replyText}>
                  {message.reply_to_snippet.is_deleted ? '🚫 Deleted message' : message.reply_to_snippet.text}
                </Text>
              </View>
            </View>
          )}

          {/* Media attachments */}
          {!isDeleted && message.media && message.media.length > 0 && (
            <MediaGrid media={message.media} />
          )}

          {/* Content text / tombstone */}
          <View style={styles.contentWrapper}>
            <Text style={[styles.text, isDeleted && styles.deletedText]}>
              {isDeleted ? '🚫 This message was deleted' : message.content || (message as any).text}
            </Text>

            <View style={styles.statusContainer}>
              {message.edited_at && !isDeleted && (
                <Text style={styles.editedTag}>(edited)</Text>
              )}
              <Text style={styles.time}>{formatMessageTime(message.created_at)}</Text>
              {getReceiptStatus()}
            </View>
          </View>

          {/* Reaction Pills Row */}
          {!isDeleted && message.reactions && message.reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {message.reactions.map((react) => (
                <TouchableOpacity
                  key={react.emoji}
                  style={[styles.reactionPill, react.reacted_by_me && styles.reactionPillActive]}
                  onPress={() => handleReactionClick(react.emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{react.emoji}</Text>
                  <Text style={styles.reactionCount}>{react.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (
  isDark: boolean,
  isMyMessage: boolean,
  colors: typeof chatColors.dark
) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: 10,
    },
    rightAlign: {
      justifyContent: 'flex-end',
    },
    leftAlign: {
      justifyContent: 'flex-start',
    },
    messageContainer: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isMyMessage
        ? isDark
          ? 'rgba(167, 139, 250, 0.3)'
          : 'rgba(88, 86, 214, 0.3)'
        : colors.border,
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    myMessageTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bubbleMine,
      opacity: isDark ? 0.18 : 0.12,
    },
    messageContent: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      maxWidth: '100%',
    },
    replyPreviewCard: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.05)',
      borderRadius: 8,
      padding: 6,
      marginBottom: 6,
      overflow: 'hidden',
    },
    replyBar: {
      width: 3,
      backgroundColor: colors.accent,
      borderRadius: 2,
      marginRight: 6,
    },
    replyContent: {
      flex: 1,
    },
    replySender: {
      fontSize: 11,
      color: colors.accent,
      fontWeight: '600',
    },
    replyText: {
      fontSize: 12,
      color: colors.subtext,
    },
    contentWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      maxWidth: '100%',
    },
    text: {
      color: colors.text,
      fontSize: chatTypography.message.fontSize,
      lineHeight: chatTypography.message.lineHeight,
      flexShrink: 1,
      marginRight: 8,
    },
    deletedText: {
      fontStyle: 'italic',
      color: colors.subtext,
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 'auto',
      alignSelf: 'flex-end',
      paddingTop: 4,
    },
    editedTag: {
      fontSize: 10,
      fontStyle: 'italic',
      color: colors.subtext,
      marginRight: 4,
    },
    checkIcon: {
      marginLeft: 3,
    },
    time: {
      color: colors.subtext,
      fontSize: chatTypography.time.fontSize,
    },
    reactionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
      gap: 4,
    },
    reactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    reactionPillActive: {
      backgroundColor: isDark ? 'rgba(167, 139, 250, 0.25)' : 'rgba(124, 58, 237, 0.15)',
      borderColor: colors.accent,
    },
    reactionEmoji: {
      fontSize: 12,
      marginRight: 4,
    },
    reactionCount: {
      fontSize: 11,
      color: colors.text,
      fontWeight: '600',
    },
  });

// Memoized comparison to prevent re-renders when parent state changes (typing, input, etc.)
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  const p = prevProps.message;
  const n = nextProps.message;

  if (p.message_id !== n.message_id) return false;
  if (p.content !== n.content) return false;
  if (p.is_read !== n.is_read) return false;
  if (p.edited_at !== n.edited_at) return false;
  if (p.deleted_at !== n.deleted_at) return false;
  if (prevProps.isGroupedAbove !== nextProps.isGroupedAbove) return false;
  if (prevProps.isGroupedBelow !== nextProps.isGroupedBelow) return false;
  if (prevProps.isLastInGroup !== nextProps.isLastInGroup) return false;

  // Compare reactions
  if ((p.reactions?.length || 0) !== (n.reactions?.length || 0)) return false;
  if (p.reactions && n.reactions) {
    for (let i = 0; i < p.reactions.length; i++) {
      if (
        p.reactions[i].emoji !== n.reactions[i].emoji ||
        p.reactions[i].count !== n.reactions[i].count ||
        p.reactions[i].reacted_by_me !== n.reactions[i].reacted_by_me
      ) {
        return false;
      }
    }
  }

  // Compare receipts
  if ((p.receipts?.length || 0) !== (n.receipts?.length || 0)) return false;

  return true;
};

export default memo(ChatBubbleComponent, arePropsEqual);