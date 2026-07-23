import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatColors } from '@/src/theme/chatTheme';

export interface HeaderProps {
  title: string;
  leftIcon?: string;
  onLeftPress?: () => void;
}

export default function Header({ title, leftIcon, onLeftPress }: HeaderProps) {
  const isDark = useColorScheme() === 'dark';
  const colors = chatColors[isDark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {leftIcon && (
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={onLeftPress} style={styles.leftButton}>
          {leftIcon === 'arrow-back' ? (
            <ChevronLeft size={28} color={colors.text} />
          ) : null}
        </TouchableOpacity>
      )}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  leftButton: {
    marginRight: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Dank Mono Bold',
  },
});