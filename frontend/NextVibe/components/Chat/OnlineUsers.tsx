import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Users } from 'lucide-react-native';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

interface OnlineUser {
  user_id: number;
  username: string;
  avatar: string;
}

export default function OnlineUsers({ users }: { users: OnlineUser[] }) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(users);
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const router = useRouter();

  useEffect(() => {
    setOnlineUsers(users);
  }, [users]);

  const styles = getStyles(isDark, colors);

  const EmptyState = () => (
    <View style={styles.emptyCard}>
      <BlurView
        intensity={isDark ? 30 : 90}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurViewAbsolute}
      />
      <Users size={18} color={colors.subtext} />
      <Text style={[styles.emptyText, { color: colors.subtext }]}>No one online</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={onlineUsers}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.user_id.toString()}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={{ paddingHorizontal: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.userCard}
            onPress={() =>
              router.push({
                pathname: '/user-profile',
                params: { id: item?.user_id, last_page: `/chats` },
              })
            }
            activeOpacity={0.8}
          >
            <BlurView
              intensity={isDark ? 30 : 30}
              tint={isDark ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <View style={styles.avatarContainer}>
              <Image source={{ uri: `${item.avatar}` }} style={styles.avatar} />
              <View style={[styles.onlineIndicator, { borderColor: isDark ? colors.bg : '#FFFFFF' }]} />
            </View>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {item.username}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const getStyles = (isDark: boolean, colors: typeof chatColors.dark) =>
  StyleSheet.create({
    container: {
      marginBottom: 20,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: chatRadius.card,
      marginRight: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      height: 56,
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 11,
      height: 11,
      borderRadius: 5.5,
      backgroundColor: colors.success,
      borderWidth: 2,
    },
    username: {
      fontSize: 14,
      fontFamily: 'Dank Mono Bold',
      includeFontPadding: false,
      maxWidth: 100,
    },
    emptyCard: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: chatRadius.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    emptyText: {
      fontSize: 13,
      marginLeft: 8,
      fontFamily: 'Dank Mono Bold',
      includeFontPadding: false,
    },
  });