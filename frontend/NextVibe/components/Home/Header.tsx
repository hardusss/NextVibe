import { TouchableOpacity, Text, View, StyleSheet, Animated } from "react-native";
import { useRef, useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import FastImage from 'react-native-fast-image';
import getCountUnreadNotifications from "@/src/api/get.count.unread.notification";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Header() {
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(50)).current;
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const styles = getStyles(isDark);
  const [notificationsCount, setNotificationsCount] = useState(0)
  let rightPosition = -15;
    if (notificationsCount > 9 && notificationsCount <= 99) {
      rightPosition = -6;
    } else if (notificationsCount <= 9) {
      rightPosition = -1;
    } else if (notificationsCount >= 99 && notificationsCount < 999) {
      rightPosition = -11;
    }

  const displayCount = (): string => {
    return (
        notificationsCount > 999
          ? '999+'
          : notificationsCount > 99
            ? '99+'
            : notificationsCount > 9
              ? '9+'
              : notificationsCount.toString()
    )

  }

  const fetchCountUnreadNotification = async () => {
    const countUnread = await getCountUnreadNotifications();
    setNotificationsCount(countUnread)
  }

  useFocusEffect(
    useCallback(() => {
      fetchCountUnreadNotification();
      const interval = setInterval(fetchCountUnreadNotification, 30000);
      return () => clearInterval(interval);
    }, [])
  );


  return (
    <Animated.View style={[styles.container, {
      height
    }]}>
      <View style={styles.headerFixed}>
        <View style={styles.row}>
          <Text style={styles.text}>NextVibe</Text>
          <View style={{flexDirection: "row", gap: 15}}>
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.notifyContainer} onPress={() => router.push("/notifications")}>
              <MaterialCommunityIcons name="bell-outline" size={30} color="#fafafa" />
              {notificationsCount > 0 && (
                <View style={[
                  styles.counterBox,
                  {right: rightPosition,},
                  
                ]}>
                  <Text style={[styles.counterText, {fontSize: notificationsCount > 999 ? 8 : 10}]}>
                    {displayCount()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <FastImage
              source={require('@/assets/logo.png')}
              style={styles.logo}
              resizeMode={FastImage.resizeMode.contain}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    zIndex: 100,
    width: '100%',
    marginTop: -5,
    
  },
  notifyContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center"
  },
  counterBox: {
    position: "absolute",
    right: -15,
    top: 15,
    backgroundColor: "#7F00FF",
    paddingHorizontal: 5,
    height: 14,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  counterText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },

  headerFixed: {
    paddingHorizontal: 10,
    backgroundColor: isDark ? '#0A0410' : '#fff',
    zIndex: 2,
  },
  buttonContainer: {
    paddingHorizontal: 10,
    backgroundColor: isDark ? '#0A0410' : '#fff',
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
  
  },
  messageButton: {
    backgroundColor: isDark ? '#D9D9D9' : '#0A0410',
    width: "100%",
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  messageButtonText: {
    color: isDark ? '#0A0410' : '#D9D9D9',
    fontSize: 16,
    fontWeight: "bold"
  },
  text: {
    fontSize: 35,
    color: isDark ? '#D9D9D9' : 'black',
    marginLeft: 2
  },
  logo: {
    width: 50,
    height: 50,
    marginTop: 5
  },
  
});
