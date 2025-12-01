import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  Image, 
  StyleSheet, 
  TouchableOpacity, 
  useColorScheme, 
  Animated, 
  Dimensions,
  TouchableWithoutFeedback 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import timeAgo from '@/src/utils/formatTime';
import ConfirmDialog from '../Shared/Toasts/ConfirmDialog';
import Web3Toast from '../Shared/Toasts/Web3Toast';

const { width: screenWidth } = Dimensions.get('window');

interface ChatUser {
  user_id: number;
  username: string;
  avatar: string | null;
  is_online: boolean;
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
        pathname: "/(tabs)/chat-room",
        params: { id: chat.chat_id, userId: chat.other_user.user_id }
      });
    }
  };

  const messageContent = chat.last_message?.content || 'No messages yet';
  const messageTime = chat.last_message?.created_at ? timeAgo(chat.last_message.created_at) : '';

  return (
    <>
      <TouchableWithoutFeedback onPress={isPressed ? resetPosition : undefined}>
        <Animated.View style={[styles.wrapper, { opacity }]}>
          {isPressed && (
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={styles.deleteButton}
              onPress={handleDeletePress}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Text style={styles.deletingText}>Deleting...</Text>
              ) : (
                <MaterialIcons name="delete" size={24} color="#fff" />
              )}
            </TouchableOpacity>
          )}

          <Animated.View style={{ transform: [{ translateX }] }}>
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              style={[styles.container, { backgroundColor: isDark ? '#0A0410' : '#fff' }]}
              onPress={handlePress}
              onLongPress={handleLongPress}
              delayLongPress={500}
              disabled={isDeleting}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: `${chat.other_user.avatar}` }}
                  style={styles.avatar}
                />
                {chat.other_user.is_online && <View style={styles.onlineIndicator} />}
              </View>
              
              <View style={styles.contentContainer}>
                <View style={styles.header}>
                  <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>
                    {chat.other_user.username}
                  </Text>
                  <Text style={styles.time}>{messageTime}</Text>
                </View>
                
                <View style={styles.messageContainer}>
                  <Text 
                    style={[styles.message, { color: isDark ? '#aaa' : '#666' }]}
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
    padding: 15,
    borderBottomWidth: 0.2,
    borderBottomColor: 'gray',
    backgroundColor: isDark ? '#0A0410' : '#fff',
    zIndex: 1,
  },
  avatarContainer: {
    position: 'relative'
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff'
  },
  contentContainer: {
    flex: 1,
    marginLeft: 15
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5
  },
  username: {
    fontSize: 16,
    fontWeight: '600'
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
    fontWeight: '600',
  },
});