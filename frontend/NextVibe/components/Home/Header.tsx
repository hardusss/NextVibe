import { TouchableOpacity, Text, View, StyleSheet, Animated, Easing } from "react-native";
import { useRef, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import FastImage from 'react-native-fast-image';

export default function Header({ isVisible }: { isVisible: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(110)).current;
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);
  const prevVisible = useRef<boolean>(isVisible);
  const animationTimeout = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (prevVisible.current === isVisible) return;

    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    animationTimeout.current = setTimeout(() => {
      prevVisible.current = isVisible;
      
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: isVisible ? 0 : -40,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.bezier(0.4, 0, 0.2, 1)
        }),
        Animated.timing(scaleY, {
          toValue: isVisible ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.bezier(0.4, 0, 0.2, 1)
        }),
        Animated.timing(scale, {
          toValue: isVisible ? 1 : 0.9,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.bezier(0.4, 0, 0.2, 1)
        }),
        Animated.timing(opacity, {
          toValue: isVisible ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        
          easing: Easing.bezier(0.4, 0, 0.2, 1)
        }),
        Animated.timing(height, {
          toValue: isVisible ? 110 : 50,
          duration: 300,
          useNativeDriver: true,
        
          easing: Easing.bezier(0.4, 0, 0.2, 1)
        })
      ]).start();
    }, 150);

    return () => {
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }
    };
  }, [isVisible]);

  return (
    <Animated.View style={[styles.container, {
      height
    }]}>
      <View style={styles.headerFixed}>
        <View style={styles.row}>
          <Text style={styles.text}>NextVibe</Text>
          <FastImage
            source={require('@/assets/logo.png')}
            style={styles.logo}
            resizeMode={FastImage.resizeMode.contain}
          />
        </View>
      </View>

    
      <Animated.View 
        style={[
          styles.buttonContainer,
          {
            transform: [
              { translateY },
              { scaleY },
              { scale }
            ],
            opacity,
          }
        ]}
      >
        <TouchableOpacity style={styles.messageButton} onPress={() => router.push("/chats")}>
          <Text style={styles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    zIndex: 100,
    width: '100%',
    marginTop: -5,
  },
  headerFixed: {
    paddingHorizontal: 10,
    backgroundColor: isDark ? '#130E1D' : '#fff',
    zIndex: 2,
  },
  buttonContainer: {
    paddingHorizontal: 10,
    paddingBottom :10,
    backgroundColor: isDark ? '#130E1D' : '#fff',
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
  
  },
  messageButton: {
    backgroundColor: isDark ? '#D9D9D9' : '#130E1D',
    width: "100%",
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  messageButtonText: {
    color: isDark ? '#130E1D' : '#D9D9D9',
    fontSize: 16,
    fontWeight: "bold"
  },
  text: {
    fontSize: 35,
    fontWeight: 'bold',
    color: isDark ? '#D9D9D9' : 'black',
  },
  logo: {
    width: 50,
    height: 50,
    marginTop: 5
  },
  
});
