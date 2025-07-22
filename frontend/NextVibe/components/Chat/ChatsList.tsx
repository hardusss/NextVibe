import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import OnlineUsers from './OnlineUsers';
import ChatItem from './ChatItem';
import { getChats, getOnlineUsers } from '@/src/api/chat';
import Header from './Header';
import { router, useFocusEffect } from 'expo-router';
import { ChatItemSkeleton, OnlineUserSkeleton } from './SkeletonLoaders';
import { Chat } from './ChatItem';
import { deleteChat } from '@/src/api/chat';


export default function ChatsList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = useColorScheme() === 'dark';
  const styles = getStyles(isDark);

  const checkAndUpdateUserId = useCallback(async () => {
    const storedId = await AsyncStorage.getItem('id');
    if (!currentUserId || storedId !== currentUserId) {
      setCurrentUserId(storedId);
      await loadAllData();
    }
  }, [currentUserId]);

  const loadChats = async () => {
    setChatLoading(true);
    try {
      const data = await getChats();
      setChats(data);
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const loadOnlineUsers = async () => {
    setOnlineLoading(true);
    try {
      const data = await getOnlineUsers();
      setOnlineUsers(data);
    } catch (error) {
      console.error('Failed to load online users:', error);
    } finally {
      setOnlineLoading(false);
    }
  };

  const loadAllData = async () => {
    await Promise.all([loadChats(), loadOnlineUsers()]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkAndUpdateUserId();
    }, [])
  );

  useEffect(() => {
    setFilteredChats(
      searchQuery.trim() === ''
        ? chats
        : chats.filter((chat) =>
            chat.other_user.username.toLowerCase().includes(searchQuery.toLowerCase())
          )
    );
  }, [searchQuery, chats]);

  const SearchBar = ({ placeholder, value, onChangeText }: any) => (
    <View
      style={[
        styles.searchContainer,
        { backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' },
      ]}
    >
      <MaterialIcons name="search" size={24} color={isDark ? '#666' : '#999'} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#666' : '#999'}
        style={[styles.searchInput, { color: isDark ? '#fff' : '#000' }]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );

  const ListHeader = () => (
    <>
      <Header
        title="Chats"
        leftIcon="arrow-back"
        onLeftPress={() => router.push('/home')}
      />
      <SearchBar
        placeholder="Search messages..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {onlineLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[1, 2, 3, 4].map((i) => (
            <OnlineUserSkeleton key={i} />
          ))}
        </ScrollView>
      ) : (
        <OnlineUsers users={onlineUsers} />
      )}
      {chatLoading && (
        <View>
          {[1, 2, 3, 4].map((i) => (
            <ChatItemSkeleton key={i} />
          ))}
        </View>
      )}
    </>
  );

  return (
    <FlatList
      data={chatLoading ? [] : filteredChats}
      keyExtractor={(item) => item.chat_id.toString()}
      renderItem={({ item }) => <ChatItem chat={item} onDelete={() => deleteChat(+item.chat_id)}/>}
      contentContainerStyle={styles.container}
      ListHeaderComponent={ListHeader}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={isDark ? '#fff' : '#000'}
          colors={['#00CED1']}
        />
        
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No chats found</Text>
          <Text style={styles.emptySubText}>
            You have no chats yet. Start a conversation with someone!
          </Text>
        </View>
      }
      
    />
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0A0410' : '#fff',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 50,
      paddingHorizontal: 20,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
    },
    emptySubText: {
      fontSize: 14,
      textAlign: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      margin: 10,
      borderRadius: 10,
    },
    searchInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 16,
    },
  });