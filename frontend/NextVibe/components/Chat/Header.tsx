import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface HeaderProps {
  title: string;
  leftIcon?: string;
  onLeftPress?: () => void;
}

export default function Header({ title, leftIcon, onLeftPress }: HeaderProps) {
  const isDark = useColorScheme() === 'dark';
  
  return (
    <View style={styles.header}>
      {leftIcon && (
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={onLeftPress} style={styles.leftButton}>
          <MaterialIcons name={leftIcon as any} size={28} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>
      )}
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 20,
    backgroundColor: 'transparent',
  },
  leftButton: {
    marginRight: 16
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  }
});