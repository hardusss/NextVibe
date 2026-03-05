import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import FastImage from 'react-native-fast-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface OnlineUser {
  user_id: number;
  username: string;
  avatar: string;
}

export default function OnlineUsers({users}: { users: OnlineUser[] }) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(users);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);

  const EmptyState = () => (
    <View style={styles.emptyCard}>
        <BlurView
            intensity={isDark ? 30 : 90}
            tint={isDark ? 'dark' : 'light'}
            style={styles.blurViewAbsolute}
        />
        <Ionicons name="people-outline" size={20} color={isDark ? '#888' : '#555'} />
        <Text style={styles.emptyText}>No one online</Text>
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
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            style={styles.userCard}
            onPress={() => router.push({
              pathname: "/user-profile",
              params: { id: item?.user_id, last_page: `/chats` }
            })}
          >
            <BlurView
                intensity={isDark ? 30 : 30}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
            />
            <View style={styles.avatarContainer}>
              <FastImage
                source={{ 
                  uri: `${item.avatar}`,
                  priority: FastImage.priority.normal,
                  cache: FastImage.cacheControl.immutable
                }}
                style={styles.avatar}
              />
              <View style={[styles.onlineIndicator, { borderColor: isDark ? '#333' : '#eee' }]} />
            </View>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(109, 109, 109, 0.5)',
    overflow: 'hidden',
    height: 60,
  },
  blurViewAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20
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
  },
  username: {
    fontSize: 14,
    fontFamily: "Dank Mono Bold",
includeFontPadding:false,
    color: isDark ? '#fff' : '#000',
    maxWidth: 100,
  },
  emptyCard: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 14,
    color: isDark ? '#888' : '#555',
    marginLeft: 8,
    fontFamily: "Dank Mono Bold",
includeFontPadding:false,
  },
});