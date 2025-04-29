import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, useColorScheme } from 'react-native';
import { SearchBar } from '../SearchBar';
import OnlineUsers from './OnlineUsers';
import ChatItem from './ChatItem';
import { getChats } from '@/src/api/chat';
import Header from './Header';

export default function ChatsList() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const isDark = useColorScheme() === 'dark';

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000' : '#fff'
    },
    list: {
      flex: 1
    }
  });

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const data = await getChats();
      setChats(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Chats" />
      <SearchBar placeholder="Search messages..." />
      <OnlineUsers />
      <FlatList
        data={chats}
        renderItem={({item}) => <ChatItem chat={item} />}
        style={styles.list}
      />
    </View>
  );
}
