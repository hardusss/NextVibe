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
    <View style={[styles.header, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      {leftIcon && (
        <TouchableOpacity onPress={onLeftPress} style={styles.leftButton}>
          <MaterialIcons name={leftIcon as any} size={24} color={isDark ? '#fff' : '#000'} />
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
    borderBottomWidth: 1,
    borderBottomColor: '#00CED1'
  },
  leftButton: {
    marginRight: 16
  },
  title: {
    fontSize: 20,
    fontWeight: '600'
  }
});
