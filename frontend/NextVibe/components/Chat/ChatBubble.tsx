import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { storage } from '@/src/utils/storage';
import MediaGrid from './MediaGrid';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { Check, CheckCheck } from 'lucide-react-native';

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
  onReply?: (message: Message) => void;
  onReactionPress?: (messageId: number, emoji: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: number) => void;
}

function formatMessageTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const localDate = new Date(date.getTime()); 
    const hours = localDate.getHours().toString().padStart(2, '0');
    const minutes = localDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}

const ChatBubble: React.FC<Props> = ({ message, onReply, onReactionPress, onEdit, onDelete }) => {
  const isDark = useColorScheme() === 'dark';
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const getId = async () => {
      const id = await storage.getItem('id');
      setUserId(Number(id));
    };
    getId();
  }, []);

  if (userId === null) {
    return null;
  }

  const isMyMessage = message.sender_id === userId;
  const styles = getStyles(isDark, isMyMessage);

  const handleLongPress = () => {
    if (message.deleted_at) return;
    if (onReply) {
      onReply(message);
    } else if (message.content) {
      Clipboard.setStringAsync(message.content);
    }
  };

  // Derive receipt status for my messages
  const getReceiptStatus = () => {
    if (!isMyMessage) return null;

    if (message.is_read) {
      return <CheckCheck size={14} color="#38BDF8" style={styles.checkIcon} />;
    }

    const recipientReceipts = (message.receipts || []).filter(r => r.user_id !== userId);
    
    if (recipientReceipts.length > 0) {
      const allRead = recipientReceipts.every(r => r.read_at !== null);
      if (allRead) {
        return <CheckCheck size={14} color="#38BDF8" style={styles.checkIcon} />;
      }
      const anyDelivered = recipientReceipts.some(r => r.delivered_at !== null);
      if (anyDelivered) {
        return <CheckCheck size={14} color={isDark ? '#94A3B8' : '#64748B'} style={styles.checkIcon} />;
      }
    }

    return <Check size={14} color={isDark ? '#94A3B8' : '#64748B'} style={styles.checkIcon} />;
  };

  const isDeleted = !!message.deleted_at;

  return (
    <View style={[styles.container, isMyMessage ? styles.rightAlign : styles.leftAlign]}>
      <View style={styles.messageContainer}>
        <BlurView
            intensity={isMyMessage ? (isDark ? 30 : 60) : (isDark ? 25 : 95)}
            tint={isMyMessage ? 'dark' : (isDark ? 'dark' : 'light')}
            style={styles.blurViewAbsolute}
        />
        {isMyMessage && <View style={styles.myMessageTint} />}
        
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            style={styles.messageContent}
            onLongPress={handleLongPress}
            delayLongPress={300}
            activeOpacity={0.8}
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
                  {isDeleted ? '🚫 This message was deleted' : message.content}
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
                    onPress={() => onReactionPress && onReactionPress(message.message_id, react.emoji)}
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

const getStyles = (isDark: boolean, isMyMessage: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  rightAlign: {
    justifyContent: 'flex-end',
  },
  leftAlign: {
    justifyContent: 'flex-start',
  },
  messageContainer: {
    maxWidth: '82%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isMyMessage 
      ? (isDark ? 'rgba(167, 139, 250, 0.3)' : 'rgba(88, 86, 214, 0.3)')
      : (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)'),
  },
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
  myMessageTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? '#A78BFA' : '#5856D6',
    opacity: 0.15,
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
    backgroundColor: '#A78BFA',
    borderRadius: 2,
    marginRight: 6,
  },
  replyContent: {
    flex: 1,
  },
  replySender: {
    fontSize: 11,
    color: '#A78BFA',
    fontWeight: '600',
  },
  replyText: {
    fontSize: 12,
    color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
  },
  contentWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  text: {
    color: isMyMessage ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#FFFFFF' : '#000000'),
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1, 
    marginRight: 8, 
  },
  deletedText: {
    fontStyle: 'italic',
    color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
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
    color: isDark ? '#A09CB8' : '#666',
    marginRight: 4,
  },
  checkIcon: {
    marginLeft: 3,
  },
  time: {
    color: isMyMessage ? (isDark ? '#E0CFFD' : '#333') : (isDark ? '#888' : '#666'),
    fontSize: 11,
    opacity: isMyMessage ? 1 : 0.8,
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
    backgroundColor: 'rgba(167, 139, 250, 0.25)',
    borderColor: '#A78BFA',
  },
  reactionEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  reactionCount: {
    fontSize: 11,
    color: isDark ? '#FFF' : '#333',
    fontWeight: '600',
  },
});

export default ChatBubble;