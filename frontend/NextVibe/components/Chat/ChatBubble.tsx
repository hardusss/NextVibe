import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  message_id: number;
  sender_id: number;
  content: string;
  created_at: string;
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function ChatBubble({ message }: { message: Message }) {
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

  return (
    <View style={[styles.container, isMyMessage ? styles.rightAlign : styles.leftAlign]}>
      <View style={styles.messageContent}>
        <View style={styles.row}>
          {message.content && (
            <Text style={styles.text}>{message.content}</Text>
          )}
          <Text style={styles.time}>{formatMessageTime(message.created_at)}</Text>
        </View>
      </View>
    </View>
  );
}

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
  time: {
    color: isMyMessage ? '#e0f7f5' : (isDark ? '#888' : '#666'),
    fontSize: 12,
  },
});
