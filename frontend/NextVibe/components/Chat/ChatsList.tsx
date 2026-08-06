import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  TouchableOpacity,
} from 'react-native';
import { storage } from '@/src/utils/storage';
import { Search, MessageSquareDashed, Users } from 'lucide-react-native';
import OnlineUsers from './OnlineUsers';
import ChatItem, { Chat } from './ChatItem';
import { getChats, getOnlineUsers, deleteChat } from '@/src/api/chat';
import WebSocketService from '@/src/services/WebSocketService';
import Header from './Header';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isLoadedOnceRef = useRef(false);

  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  // Load user ID once
  useEffect(() => {
    const fetchUserId = async () => {
      const storedId = await storage.getItem('id');
      if (storedId) {
        setCurrentUserId(Number(storedId));
      }
    };
    fetchUserId();
  }, []);

  const loadChats = useCallback(async (showSkeleton = true) => {
    if (showSkeleton && !isLoadedOnceRef.current) {
      setChatLoading(true);
    }
    try {
      const data = await getChats();
      if (Array.isArray(data)) {
        setChats(data);
        isLoadedOnceRef.current = true;
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setChatLoading(false);
    }
  }, []);

  const loadOnlineUsers = useCallback(async () => {
    try {
      const data = await getOnlineUsers();
      if (Array.isArray(data)) {
        setOnlineUsers(data as any);
      }
    } catch (error) {
      console.error('Failed to load online users:', error);
    } finally {
      setOnlineLoading(false);
    }
  }, []);

  const loadAllData = useCallback(async (showSkeleton = false) => {
    await Promise.all([loadChats(showSkeleton), loadOnlineUsers()]);
  }, [loadChats, loadOnlineUsers]);

  // Silent focus refresh - does not flash skeleton loader!
  useFocusEffect(
    useCallback(() => {
      loadAllData(!isLoadedOnceRef.current);
    }, [loadAllData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(false);
    setRefreshing(false);
  }, [loadAllData]);

  // WebSocket listener for live message updates & unread badges
  useEffect(() => {
    const unsubscribeWS = WebSocketService.addListener((event: any) => {
      if (!event) return;

      if (event.type === 'message') {
        const incomingChatId = Number(event.chat_id);
        const incomingContent = event.content || event.text || '';
        const incomingCreatedAt = event.created_at || new Date().toISOString();
        const senderId = Number(event.sender_id || event.sender?.user_id);

        setChats(prevChats => {
          const chatIndex = prevChats.findIndex(c => c.chat_id === incomingChatId);

          if (chatIndex !== -1) {
            const updatedChats = [...prevChats];
            const targetChat = { ...updatedChats[chatIndex] };

            targetChat.last_message = {
              content: incomingContent,
              created_at: incomingCreatedAt,
              media: event.media || event.media_attachments || event.media_keys || [],
            };

            // Increment unread count if message is from another user
            if (currentUserId && senderId !== currentUserId) {
              const currentUnread =
                targetChat.unread_count ||
                (targetChat as any).unread_messages_count ||
                (targetChat as any).unread_count_user ||
                0;
              targetChat.unread_count = currentUnread + 1;
            }

            // Move chat to top of list
            updatedChats.splice(chatIndex, 1);
            return [targetChat, ...updatedChats];
          } else {
            // Chat not in list, fetch silently
            loadChats(false);
            return prevChats;
          }
        });
      } else if (event.type === 'read_receipt') {
        const readChatId = Number(event.chat_id);
        setChats(prevChats =>
          prevChats.map(c => {
            if (c.chat_id === readChatId) {
              return { ...c, unread_count: 0 };
            }
            return c;
          })
        );
      }
    });

    return () => {
      unsubscribeWS();
    };
  }, [currentUserId, loadChats]);

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

  useEffect(() => {
    setFilteredChats(
      searchQuery.trim() === ''
        ? chats
        : chats.filter(chat =>
            chat.other_user?.username?.toLowerCase().includes(searchQuery.toLowerCase())
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
            {[1, 2, 3, 4].map(i => (
              <OnlineUserSkeleton key={i} />
            ))}
          </ScrollView>
        ) : (
          <OnlineUsers users={onlineUsers} />
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(shared)/cherry-chat' as any)}
          style={{
            marginHorizontal: 12,
            marginVertical: 8,
            borderRadius: chatRadius.card || 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#FF5BA844',
          }}
        >
          <LinearGradient
            colors={['#2A122E', '#16091F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#FF5BA822',
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: '#FF5BA8',
                marginRight: 12,
              }}
            >
              <Users size={24} color="#FF5BA8" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Dank Mono Bold', marginRight: 6 }}>
                  NextVibe Group
                </Text>
                <View
                  style={{
                    backgroundColor: '#FF5BA833',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#FF5BA866',
                  }}
                >
                  <Text style={{ color: '#FF5BA8', fontSize: 10, fontFamily: 'Dank Mono Bold' }}>
                    Cherry
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#A0A0B0', fontSize: 12 }} numberOfLines={1}>
                Shared NextVibe community group for all users
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        {chatLoading && chats.length === 0 && (
          <View>
            {[1, 2, 3, 4].map(i => (
              <ChatItemSkeleton key={i} />
            ))}
          </View>
        )}
      </LinearGradient>
    ),
    [isDark, colors, searchQuery, onlineLoading, onlineUsers, chatLoading, chats.length]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <FlatList
        data={chatLoading && chats.length === 0 ? [] : filteredChats}
        keyExtractor={item => item.chat_id.toString()}
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
            progressViewOffset={insets.top + 10}
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