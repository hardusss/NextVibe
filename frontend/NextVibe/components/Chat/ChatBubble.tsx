import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaGrid from './MediaGrid';
import Clipboard from '@react-native-clipboard/clipboard';

interface MediaAttachment {
  id: number;
  file_url: string | null;
  isTemp?: boolean;  // Додаємо опціональне поле isTemp
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
  const localDate = new Date(date.getTime() + (3 * 60 * 60 * 1000)); 
  const hours = localDate.getHours().toString().padStart(2, '0');
  const minutes = localDate.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const ChatBubble: React.FC<Props> = ({ message }) => {
  const isDark = useColorScheme() === 'dark';
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const getId = async () => {
      const id = await AsyncStorage.getItem('id');
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
      <TouchableOpacity 
        style={styles.messageContent}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        {message.media && message.media.length > 0 && (
          <MediaGrid media={message.media} />
        )}
        <View style={styles.row}>
          {message.content && (
            <Text style={styles.text}>{message.content}</Text>
          )}
          <View style={styles.messageStatus}>
            <Text style={styles.time}>{formatMessageTime(message.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
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
  messageContent: {
    backgroundColor: isMyMessage ? '#4FD1C5' : (isDark ? '#2c2c2c' : '#e0e0e0'),
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    maxWidth: '80%',
    alignSelf: isMyMessage ? 'flex-end' : 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  text: {
    color: isMyMessage ? '#fff' : (isDark ? '#fff' : '#000'),
    fontSize: 16,
    marginRight: 6,
  },
  messageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    marginLeft: 4,
  },
  time: {
    color: isMyMessage ? '#e0f7f5' : (isDark ? '#888' : '#666'),
    fontSize: 12,
  },
  mediaContainer: {
    marginBottom: 8,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    margin: -2,
  },
  mediaPreview: {
    width: 200,
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
  },
  readStatus: {
    fontSize: 12,
    color: '#8e8e8e',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
});

export default ChatBubble;