import { TouchableOpacity, Text, View, StyleSheet, Animated } from "react-native";
import { useRef, useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Image } from 'expo-image';
import getCountUnreadNotifications from "@/src/api/get.count.unread.notification";
import { Bell } from "lucide-react-native"

export default function Header() {
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(50)).current;
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = getStyles(isDark, insets.top);
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
            <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.notifyContainer} onPress={() => router.push("/notifications")}>
              <Bell size={24} color={isDark ? "#fafafa" : "#1A1225"} />
              {notificationsCount > 0 && (
                <View style={[
                  styles.counterBox,
                  { right: rightPosition === -15 ? -4 : rightPosition === -6 ? -6 : rightPosition === -1 ? -4 : -8 },
                ]}>
                  <Text style={[styles.counterText, { fontSize: notificationsCount > 999 ? 7 : 8 }]}>
                    {displayCount()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Image
              source={require('@/assets/logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const getStyles = (isDark: boolean, topInset: number) => StyleSheet.create({
  container: {
    zIndex: 100,
    width: '100%',
    paddingTop: topInset,
    backgroundColor: isDark ? '#0A0410' : '#fff',
  },
  notifyContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    height: 40,
    width: 40,
  },
  counterBox: {
    position: "absolute",
    top: 4,
    backgroundColor: "#A855F7",
    paddingHorizontal: 4,
    height: 16,
    minWidth: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: isDark ? '#0A0410' : '#fff',
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  counterText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Dank Mono Bold",
    includeFontPadding: false,
    textAlign: "center",
  },

  headerFixed: {
    paddingHorizontal: 12,
    backgroundColor: isDark ? '#0A0410' : '#fff',
    zIndex: 2,
    paddingVertical: 8,
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
    fontFamily: "Dank Mono Bold",
    fontSize: 26,
    color: isDark ? '#F3EEFF' : '#1A1225',
    marginLeft: 2,
    letterSpacing: -0.75,
    includeFontPadding: false,
  },
  logo: {
    width: 32,
    height: 32,
  },

});
