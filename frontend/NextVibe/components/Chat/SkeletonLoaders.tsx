import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';


export const OnlineUserSkeleton = () => {
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.onlineUserSkeleton}>
      <View style={[styles.avatar, { backgroundColor: isDark ? '#2c2c2c' : '#e0e0e0' }]} />
      <View style={[styles.username, { backgroundColor: isDark ? '#2c2c2c' : '#e0e0e0' }]} />
    </View>
  );
};

export const ChatItemSkeleton = () => {
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.chatItemSkeleton}>
      <View style={[styles.chatAvatar, { backgroundColor: isDark ? '#2c2c2c' : '#e0e0e0' }]} />
      <View style={styles.chatInfo}>
        <View style={[styles.chatName, { backgroundColor: isDark ? '#2c2c2c' : '#e0e0e0' }]} />
        <View style={[styles.chatMessage, { backgroundColor: isDark ? '#2c2c2c' : '#e0e0e0' }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  onlineUserSkeleton: {
    width: 70,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  username: {
    width: 50,
    height: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  chatItemSkeleton: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  chatInfo: {
    marginLeft: 12,
    flex: 1,
  },
  chatName: {
    width: 120,
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  chatMessage: {
    width: 200,
    height: 14,
    borderRadius: 7,
  },
});
