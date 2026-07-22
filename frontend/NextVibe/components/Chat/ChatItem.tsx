import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  useColorScheme, 
  Animated, 
  Dimensions,
  TouchableWithoutFeedback 
} from 'react-native';
import { Trash2, BadgeCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import timeAgo from '@/src/utils/formatTime';
import ConfirmDialog from '../Shared/Toasts/ConfirmDialog';
import Web3Toast from '../Shared/Toasts/Web3Toast';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';

const { width: screenWidth } = Dimensions.get('window');
const DEFAULT_AVATAR = 'https://media.nextvibe.io/images/default.png';

interface ChatUser {
  user_id: number;
  username: string;
  avatar: string | null;
  is_online: boolean;
  official?: boolean;
}

interface LastMessage {
  content: string | null;
  created_at: string | null;
}

export interface Chat {
  chat_id: number;
  other_user: ChatUser;
  last_message: LastMessage | null;
}

interface ChatItemProps {
  chat: Chat;
  onDelete: (chatId: number) => boolean | Promise<boolean>;
}

export default function ChatItem({ chat, onDelete }: ChatItemProps) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [isPressed, setIsPressed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', isSuccess: false });
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const styles = getStyles(isDark);

  const handleLongPress = () => {
    setIsPressed(true);
    Animated.spring(translateX, {
      toValue: -80,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleDeletePress = () => {
    setShowConfirmDialog(true);
  };

  const confirmDelete = async () => {
    setShowConfirmDialog(false);
    setIsDeleting(true);
    
    try {
      const deleted = await onDelete(chat.chat_id);
      
      if (deleted) {
        setToast({ 
          visible: true, 
          message: 'Chat deleted successfully', 
          isSuccess: true 
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
        setToast({ 
          visible: true, 
          message: 'Failed to delete chat', 
          isSuccess: false 
        });
        resetPosition();
      }
    } catch (error) {
      console.error('Delete error:', error);
      setToast({ 
        visible: true, 
        message: 'An error occurred while deleting', 
        isSuccess: false 
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
        pathname: "/(shared)/chat-room",
        params: { id: chat.chat_id, userId: chat.other_user.user_id }
      });
    }
  };

  const messageContent = chat.last_message?.content || 'No messages yet';
  const messageTime = chat.last_message?.created_at ? timeAgo(chat.last_message.created_at) : '';
  const avatarUri = chat.other_user.avatar || DEFAULT_AVATAR;

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
              delayLongPress={400}
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
                {chat.other_user.is_online && <View style={styles.onlineIndicator} />}
              </View>
              
              <View style={styles.contentContainer}>
                <View style={styles.header}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.username, { color: isDark ? '#FFF' : '#111' }]} numberOfLines={1}>
                      {chat.other_user.username}
                    </Text>
                    {chat.other_user.official && (
                      <BadgeCheck size={16} color="#FF5BA8" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text style={styles.time}>{messageTime}</Text>
                </View>
                
                <View style={styles.messageContainer}>
                  <Text 
                    style={[styles.message, { color: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)' }]}
                    numberOfLines={1}
                  >
                    {messageContent}
                  </Text>
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

const getStyles = (isDark: boolean) => StyleSheet.create({
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    backgroundColor: isDark ? 'rgba(21, 7, 35, 0.4)' : 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
    zIndex: 1,
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarContainer: {
    position: 'relative'
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 91, 168, 0.4)' : 'rgba(255, 91, 168, 0.2)'
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: isDark ? '#0A0410' : '#FFF'
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
    marginBottom: 4
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
    fontFamily: "Dank Mono Bold",
    includeFontPadding: false,
  },
  time: {
    fontSize: 12,
    color: '#666'
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  message: {
    flex: 1,
    fontSize: 14,
    marginRight: 5
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  deletingText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: "Dank Mono Bold",
includeFontPadding:false,
  },
});