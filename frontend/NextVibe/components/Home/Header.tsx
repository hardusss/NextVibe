import { TouchableOpacity, Text, View, StyleSheet, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import FastImage from 'react-native-fast-image';

export default function Header({ isVisible }: { isVisible: boolean }) {
  const heightAnim = useRef(new Animated.Value(160)).current; // загальна висота
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: isVisible ? 160 : 100, // висота змінюється
        duration: 300,
        useNativeDriver: false, // важливо: height не підтримує native driver
      }),
      Animated.timing(translateY, {
        toValue: isVisible ? 0 : -20,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: isVisible ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible]);

  return (
    <Animated.View style={[styles.container, { height: heightAnim }]}>
      <View style={styles.row}>
        <Text style={styles.text}>NextVibe</Text>
        <FastImage
          source={require('@/assets/logo.png')}
          style={styles.logo}
          resizeMode={FastImage.resizeMode.contain}
        />
      </View>

      <Animated.View
        style={[
          styles.animatedWrapper,
          {
            transform: [{ translateY }],
            opacity,
          },
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
    backgroundColor: isDark ? '#130E1D' : '#fff',
    zIndex: 100,
    paddingTop: 30,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    overflow: 'hidden', 
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
    alignItems: "center"
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
  animatedWrapper: {
    width: '100%',
    marginTop: 10,
  }
});
