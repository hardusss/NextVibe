import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import GetApiUrl from '@/src/utils/url_api';
import timeAgo from '@/src/utils/formatTime';

interface ChatItemProps {
  chat: {
    chat_id: number;
    other_user: {
      user_id: number;
      username: string;
      avatar: string;
      is_online: boolean;
    };
    last_message: {
      content: string;
      created_at: string;
    };
  };
}

export default function ChatItem({ chat }: ChatItemProps) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      onPress={() => router.push({
        pathname: "/(tabs)/chat-room",
        params: { id: chat.chat_id, userId: chat.other_user.user_id}
      })}
    >
      <View style={styles.avatarContainer}>
        <Image
          source={{ uri: `${GetApiUrl().slice(0, 23)}${chat.other_user.avatar}` }}
          style={styles.avatar}
        />
        {chat.other_user.is_online && <View style={styles.onlineIndicator} />}
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>
            {chat.other_user.username}
          </Text>
          <Text style={styles.time}>{timeAgo(chat.last_message.created_at)}</Text>
        </View>
        
        <View style={styles.messageContainer}>
          <Text 
            style={[styles.message, { color: isDark ? '#aaa' : '#666' }]}
            numberOfLines={1}
          >
            {chat.last_message.content || 'No messages yet'}
          </Text>
          
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#00CED1'
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
  }
});
