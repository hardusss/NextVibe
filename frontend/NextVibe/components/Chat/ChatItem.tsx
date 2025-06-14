import React, { useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useColorScheme, Alert, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import GetApiUrl from '@/src/utils/url_api';
import timeAgo from '@/src/utils/formatTime';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const styles = getStyles(isDark); // Move styles into function with isDark param

  const handleLongPress = () => {
    setIsPressed(true);
    Animated.spring(translateX, {
      toValue: -80,
      useNativeDriver: true,
    }).start();
  };

  const handleDeletePress = async () => {
    const deleted = await onDelete(chat.chat_id);
    if (deleted) {
      Animated.timing(translateX, {
        toValue: -screenWidth,
        duration: 250,
        useNativeDriver: true
      }).start();
    }
  };

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  const messageContent = chat.last_message?.content || 'No messages yet';
  const messageTime = chat.last_message?.created_at ? timeAgo(chat.last_message.created_at) : '';

  return (
    <View style={styles.wrapper}>
      {isPressed && (
        <TouchableOpacity
          style={[styles.deleteButton]}
          onPress={handleDeletePress}
        >
          <MaterialIcons name="delete" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Animated.View style={[{ transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
          onPress={() => router.push({
            pathname: "/(tabs)/chat-room",
            params: { id: chat.chat_id, userId: chat.other_user.user_id}
          })}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: `${GetApiUrl().slice(0, 25)}${chat.other_user.avatar}` }}
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

      {showDeleteModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#222' : '#fff' }]}>
            <Text style={[styles.modalText, { color: isDark ? '#fff' : '#000' }]}>Delete this chat?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => {
                  setShowDeleteModal(false);
                  resetPosition();
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.deleteModalButton]}
                onPress={handleDeletePress}
              >
                <Text style={[styles.buttonText, { color: '#fff' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
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
    backgroundColor: isDark ? '#000' : '#fff',
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
  unreadBadge: {
    backgroundColor: '#00CED1',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
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
    zIndex: -1,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 20,
    borderRadius: 12,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  deleteModalButton: {
    backgroundColor: '#ff4444',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});