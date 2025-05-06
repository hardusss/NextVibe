import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import GetApiUrl from '@/src/utils/url_api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

interface OnlineUser {
  user_id: number;
  username: string;
  avatar: string;
}

export default function OnlineUsers({users}: { users: OnlineUser[] }) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(users);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={onlineUsers}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.user_id.toString()}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: isDark ? '#666' : '#999' }]}> 
              No users online at the moment
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.userContainer}
            onPress={() => router.push({
              pathname: "/user-profile",
              params: { id: item?.user_id, last_page: `/chats` }
            })}
          >
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: `${GetApiUrl().slice(0, 25)}${item.avatar}` }}
                style={styles.avatar}
              />
              <View style={styles.onlineIndicator} />
            </View>
            <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>
              {item.username}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 90,
    paddingHorizontal: 5
  },
  userContainer: {
    alignItems: 'center',
    marginRight: 15
  },
  avatarContainer: {
    position: 'relative'
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25
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
    borderColor: '#fff'
  },
  username: {
    marginTop: 5,
    fontSize: 12
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
