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

export default function OnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  useEffect(() => {
    fetchOnlineUsers();
  }, []);

  const fetchOnlineUsers = async () => {
    const token = await AsyncStorage.getItem('access');
    try {
      const response = await axios.get(`${GetApiUrl()}/chat/online-users/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOnlineUsers(response.data);
    } catch (error) {
      console.error('Error fetching online users:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={onlineUsers}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.user_id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.userContainer}
            onPress={() => router.push({
              pathname: "/chat-room",
              params: { id: item.user_id }
            })}
          >
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: `${GetApiUrl().slice(0, 23)}${item.avatar}` }}
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
  }
});
