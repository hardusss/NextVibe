import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { storage } from '@/src/utils/storage';
import MediaGrid from './MediaGrid';
import Clipboard from '@react-native-clipboard/clipboard';
import { BlurView } from 'expo-blur';


interface MediaAttachment {
  id: number;
  file_url: string | null;
  isTemp?: boolean;  
}

interface Message {
  message_id: number;
  content: string;
  sender_id: number;
  created_at: string;
  is_read: boolean;
  media: MediaAttachment[];
}

interface Props {
  message: Message;
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  const localDate = new Date(date.getTime()); 
  const hours = localDate.getHours().toString().padStart(2, '0');
  const minutes = localDate.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const ChatBubble: React.FC<Props> = ({ message }) => {
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
    if (message.content) {
      Clipboard.setString(message.content);
    }
  };

  return (
    <View style={[styles.container, isMyMessage ? styles.rightAlign : styles.leftAlign]}>
      <View style={styles.messageContainer}>
        <BlurView
            intensity={isMyMessage ? (isDark ? 30 : 60) : (isDark ? 25 : 95)}
            tint={isMyMessage ? 'dark' : (isDark ? 'dark' : 'light')}
            style={styles.blurViewAbsolute}
        />
        {isMyMessage && <View style={styles.myMessageTint} />}
        
        <TouchableOpacity 
            style={styles.messageContent}
            onLongPress={handleLongPress}
            delayLongPress={300}
            activeOpacity={0.8}
        >
            {message.media && message.media.length > 0 && (
                <MediaGrid media={message.media} />
            )}
            
            {message.content ? (
                <View style={styles.contentWrapper}>
                    <Text style={styles.text}>{message.content}</Text>
                    <View style={styles.statusContainer}>
                        <Text style={styles.time}>{formatMessageTime(message.created_at)}</Text>
                        
                    </View>
                </View>
            ) : (
                <View style={styles.statusContainer}>
                    <Text style={styles.time}>{formatMessageTime(message.created_at)}</Text>
                    
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
    maxWidth: '80%',
    borderRadius: 18,
    overflow: 'hidden',  // ✅ Обрізає контент що виходить за межі
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
    maxWidth: '100%',  // ✅ Обмежує ширину
  },
  contentWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    maxWidth: '100%',  // ✅ Обмежує ширину
  },
  text: {
    color: isMyMessage ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#FFFFFF' : '#000000'),
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1, 
    marginRight: 8, 
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto', 
    alignSelf: 'flex-end',
    paddingTop: 4, 
  },
  checkIcon: {
    marginLeft: 4,
    color: isMyMessage ? (isDark ? '#E0CFFD' : '#333') : (isDark ? '#888' : '#666'),
    opacity: isMyMessage ? 1 : 0.8,
  },
  time: {
    color: isMyMessage ? (isDark ? '#E0CFFD' : '#333') : (isDark ? '#888' : '#666'),
    fontSize: 12,
    opacity: isMyMessage ? 1 : 0.8,
  },
});

export default ChatBubble;