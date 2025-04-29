import React from 'react';
import { View, TextInput, StyleSheet, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SearchBarProps {
  placeholder: string;
  onSearch?: (text: string) => void;
}

export const SearchBar = ({ placeholder, onSearch }: SearchBarProps) => {
  const isDark = useColorScheme() === 'dark';
  
  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' }]}>
      <MaterialIcons name="search" size={20} color={isDark ? '#fff' : '#666'} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#666' : '#999'}
        style={[styles.input, { color: isDark ? '#fff' : '#000' }]}
        onChangeText={onSearch}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginHorizontal: 5,
    marginVertical: 20,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16
  }
});
