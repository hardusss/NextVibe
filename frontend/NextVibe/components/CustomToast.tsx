import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface CustomToastProps {
  message: string;
  isVisible: boolean;
  onHide: () => void;
  type?: 'success' | 'error';
}

export function CustomToast({ message, isVisible, onHide, type = 'success' }: CustomToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(3000), 
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(onHide, 300); // Додаємо затримку перед викликом onHide
      });
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.container, 
        { opacity },
        type === 'success' ? styles.success : styles.error
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 9999,
    // Додаємо відступи для кращої видимості
    marginHorizontal: 16,
    marginTop: 8,
  },
  success: {
    backgroundColor: '#4CAF50',
  },
  error: {
    backgroundColor: '#ff4444',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});
