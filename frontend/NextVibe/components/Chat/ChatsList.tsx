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
import { Search, MessageSquareDashed } from 'lucide-react-native';
import OnlineUsers from './OnlineUsers';
import ChatItem, { Chat } from './ChatItem';
import { getChats, getOnlineUsers, deleteChat } from '@/src/api/chat';
import Header from './Header';
import { router, useFocusEffect } from 'expo-router';
import { ChatItemSkeleton, OnlineUserSkeleton } from './SkeletonLoaders';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

const SearchBar = React.memo(({ placeholder, value, onChangeText, isDark }: any) => {
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const styles = useMemo(() => getSearchStyles(isDark, colors), [isDark, colors]);

  return (
    <View style={styles.searchContainer}>
      <BlurView
        intensity={isDark ? 30 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurViewAbsolute}
      />
      <Search size={20} color={colors.subtext} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.subtext}
        style={[styles.searchInput, { color: colors.text }]}
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
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

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
        setChats((prevChats) => prevChats.filter((chat) => chat.chat_id !== chatId));
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

  const ListHeader = useMemo(
    () => (
      <LinearGradient
        colors={
          isDark
            ? [colors.bg, '#1507239e', colors.bg]
            : [colors.bg, 'rgba(124, 58, 237, 0.08)', colors.bg]
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
    ),
    [isDark, colors, searchQuery, onlineLoading, onlineUsers, chatLoading]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <FlatList
        data={chatLoading ? [] : filteredChats}
        keyExtractor={(item) => item.chat_id.toString()}
        renderItem={({ item }) => (
          <ChatItem chat={item} onDelete={handleDeleteChat} />
        )}
        contentContainerStyle={styles.container}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          !chatLoading ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(167, 139, 250, 0.12)' : 'rgba(124, 58, 237, 0.08)' }]}>
                <MessageSquareDashed size={36} color={colors.accent} />
              </View>
              <Text style={[styles.emptyText, { color: colors.text }]}>No chats found</Text>
              <Text style={[styles.emptySubText, { color: colors.subtext }]}>
                {searchQuery
                  ? 'No conversations match your search query.'
                  : 'You have no active conversations yet. Start chatting with friends!'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const getStyles = (isDark: boolean, colors: typeof chatColors.dark) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: 'transparent',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
      paddingHorizontal: 28,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 18,
      fontFamily: 'Dank Mono Bold',
      includeFontPadding: false,
      marginBottom: 6,
    },
    emptySubText: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
  });

const getSearchStyles = (isDark: boolean, colors: typeof chatColors.dark) =>
  StyleSheet.create({
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      marginHorizontal: 10,
      marginTop: 10,
      marginBottom: 16,
      borderRadius: chatRadius.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    searchInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 15,
      paddingVertical: 12,
    },
  });