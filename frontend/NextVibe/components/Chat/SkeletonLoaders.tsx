import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useColorScheme, Animated } from 'react-native';
import { chatColors, chatRadius } from '@/src/theme/chatTheme';

export const OnlineUserSkeleton = () => {
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  const bgStyle = {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    opacity: opacityAnim,
  };

  return (
    <View style={styles.onlineUserSkeleton}>
      <Animated.View style={[styles.avatar, bgStyle]} />
      <Animated.View style={[styles.username, bgStyle]} />
    </View>
  );
};

export const ChatItemSkeleton = () => {
  const isDark = useColorScheme() === 'dark';
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  const bgStyle = {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    opacity: opacityAnim,
  };

  return (
    <View style={styles.chatItemSkeleton}>
      <Animated.View style={[styles.chatAvatar, bgStyle]} />
      <View style={styles.chatInfo}>
        <Animated.View style={[styles.chatName, bgStyle]} />
        <Animated.View style={[styles.chatMessage, bgStyle]} />
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
