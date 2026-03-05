import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  TextInput,
  ScrollView,
  StatusBar,
} from 'react-native';
import { storage } from '@/src/utils/storage';
import { MaterialIcons } from '@expo/vector-icons';
import OnlineUsers from './OnlineUsers';
import ChatItem from './ChatItem';
import { getChats, getOnlineUsers } from '@/src/api/chat';
import Header from './Header';
import { router, useFocusEffect } from 'expo-router';
import { ChatItemSkeleton, OnlineUserSkeleton } from './SkeletonLoaders';
import { Chat } from './ChatItem';
import { deleteChat } from '@/src/api/chat';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const SearchBar = React.memo(({ placeholder, value, onChangeText, isDark }: any) => {
  const styles = useMemo(() => getSearchStyles(isDark), [isDark]);
  
  return (
    <View style={styles.searchContainer}>
      <BlurView
        intensity={isDark ? 30 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurViewAbsolute}
      />
      <MaterialIcons name="search" size={24} color={isDark ? '#666' : '#605f5fff'} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#666' : '#605f5fff'}
        style={[styles.searchInput, { color: isDark ? '#fff' : '#000' }]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
});

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
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const checkAndUpdateUserId = useCallback(async () => {
    const storedId = await storage.getItem('id');
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

  const handleDeleteChat = async (chatId: number): Promise<boolean> => {
    try {
      const result = await deleteChat(chatId);
      
      if (result) {
        setChats(prevChats => prevChats.filter(chat => chat.chat_id !== chatId));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete chat:', error);
      return false;
    }
  };

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

  const ListHeader = useMemo(() => (
    <LinearGradient
      colors={
        isDark
          ? ['#0A0410', '#1507239e', '#0A0410']
          : ['#FFFFFF', '#b6a8f8ff', '#FFFFFF']
      }
    >
      <Header
        title="Chats"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />
      <SearchBar
        placeholder="Search messages..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        isDark={isDark}
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
    </LinearGradient>
  ), [isDark, searchQuery, onlineLoading, onlineUsers, chatLoading]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isDark ? '#0A0410' : '#FFFFFF'
      }}
    >
      <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"} />
      <FlatList
        data={chatLoading ? [] : filteredChats}
        keyExtractor={(item) => item.chat_id.toString()}
        renderItem={({ item }) => (
          <ChatItem 
            chat={item} 
            onDelete={handleDeleteChat}
          />
        )}
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
          !chatLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: isDark ? '#fff' : '#000' }]}>
                No chats found
              </Text>
              <Text style={[styles.emptySubText, { color: isDark ? '#A09CB8' : '#666' }]}>
                You have no chats yet. Start a conversation with someone!
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: 'transparent',
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
      fontFamily: "Dank Mono Bold",
includeFontPadding:false,
      marginBottom: 8,
    },
    emptySubText: {
      fontSize: 14,
      textAlign: 'center',
    },
  });

const getSearchStyles = (isDark: boolean) =>
  StyleSheet.create({
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginHorizontal: 10,
      marginTop: 10,
      marginBottom: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(126, 125, 125, 0.5)',
      overflow: 'hidden',
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    searchInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 16,
      paddingVertical: 14,
    },
  });