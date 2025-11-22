import { RelativePathString, Stack, useRouter, useSegments, useFocusEffect } from "expo-router";
import { FontAwesome5, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme, View, TouchableOpacity } from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";
import getUserDetail from "@/src/api/user.detail";
import FastImage from 'react-native-fast-image';
import AsyncStorage from "@react-native-async-storage/async-storage"
import { storage } from "@/src/utils/storage";
import { WebSocketProvider } from "@/src/context/WebSocketContext";
import axios from "axios";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";
import ErrorBoundary from 'react-native-error-boundary';
import ErrorFallback from "@/components/ErrorFallback";

if (__DEV__ && typeof global !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('getDevServer') || 
       args[0].includes('getDevServer is not a function'))
    ) {
      return;
    }
    originalError(...args);
  };

  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('getDevServer')
    ) {
      return;
    }
    originalWarn(...args);
  };
}

export default function Layout() {
  const theme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const currentPage = segments[segments.length - 1];
  const inactiveColor = theme === "dark" ? "#fafafa" : "black";
  const [imageProfile, setImageProfile] = useState<string | null>(null);
  const [userID, setUserID] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(false);

  const blacklist = ["register", "login", "postslist", "splash", "index", "create-post", "settings", "wallet", "select-token", "deposit", "transaction", "user-profile", "create-wallet", "result-transaction", "transactions", "transaction-detail", "chat-room", "chats", "follows-screen", "notifications", "user-banned"];

  const tabs = [
    { name: "home", icon: MaterialCommunityIcons, iconName: ["home-outline", "home"] },
    { name: "search", icon: MaterialIcons, iconName: ["search", "search"] },
    { name: "camera", icon: MaterialIcons, iconName: ["add-circle-outline", "add-circle"] },
    { name: "profile", icon: FontAwesome5, iconName: ["user", "user"] }
  ];

  const loadUserData = async () => {
    try {
      const id = await storage.getItem("id");
      const avatar = await AsyncStorage.getItem("avatar");
      
      if (id) {
        setUserID(Number(id));
      }
      
      if (avatar) {
        setImageProfile(avatar);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

 useEffect(() => {
  const interceptor = axios.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error.response?.status === 429) {
        setToastMessage("You exceeded the request limit!");
        setVisible(true);
      }
      return Promise.reject(error);
    }
  );

  return () => axios.interceptors.response.eject(interceptor);
}, []);
  useEffect(() => {
    if (blacklist.includes(currentPage) || !userID) return;
    
    const getImageProfile = async () => {
      try {
        const data = await getUserDetail();
        if (data.avatar) {
          setImageProfile(data.avatar);
          await AsyncStorage.setItem("avatar", data.avatar);
        }
      } catch (error) {
        setImageProfile("https://media.nextvibe.io/images/default.png");
        console.error('Error getting profile image:', error);
      }
    };
    
    getImageProfile();
  }, [currentPage, userID]);

  const goToTab = (tab: string) => {
    router.push(tab as RelativePathString);
  };

  const showTabBar = ![...blacklist, "camera"].includes(currentPage);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <WebSocketProvider userId={userID || 0}>
        {toastMessage && (
          <Web3Toast
            message={toastMessage}
            visible={visible}
            onHide={() => setVisible(false)}
            isSuccess={false}
          />
        )}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, animation: "none" }} >
            <Stack.Screen name="home" />
            <Stack.Screen name="search" />
            <Stack.Screen name="camera" />
            <Stack.Screen name="profile" />
            {blacklist.map((item) => <Stack.Screen key={item} name={item} />)}
          </Stack>

          {showTabBar && (
            <View style={{
              position: "absolute",
              bottom: 10,
              width: "90%",
              marginLeft: "5%",
              height: 60,
              flexDirection: "row",
              justifyContent: "space-around",
              alignItems: "center",
              borderRadius: 20,
              borderColor: theme === "dark" ? "rgba(26,26,47,0.95)" : "#D9D9D9",
              backgroundColor: theme === "dark" ? "#1A1A2F" : "#D9D9D9",
              shadowColor: "transparent",
            }}>
              {tabs.map((tab) => (
                <TouchableOpacity key={tab.name} onPress={() => goToTab(tab.name)}>
                  {tab.name === "profile" && imageProfile ? (
                    <FastImage
                      source={{ uri: imageProfile, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
                      style={{
                        width: 25,
                        height: 25,
                        borderRadius: 50,
                        borderWidth: currentPage === "profile" ? 2 : 0,
                        borderColor: "#7305f0ff",
                      }}
                    />
                  ) : tab.name === "search" ? (
                    <View style={{
                      position: "relative",
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: currentPage === "search" ? (theme === "dark" ? "#D9D9D9" : "#1A1A2F") : (theme === "dark" ? "#1A1A2F" : "#D9D9D9"),
                      width: 40,
                      height: 40,
                      borderRadius: 50,
                    }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 20,
                        backgroundColor: currentPage === "search" ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : "transparent",
                        position: "absolute",
                        left: -6,
                        bottom: -2
                      }} />
                      <MaterialIcons
                        name="search"
                        size={20}
                        color={currentPage === "search" ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : (theme === "dark" ? "#D9D9D9" : "#1A1A2F")}
                        style={{ zIndex: 9999 }}
                      />
                    </View>
                  ) : (
                    <View style={{
                      backgroundColor: currentPage === tab.name ? (theme === "dark" ? "#D9D9D9" : "#1A1A2F") : (theme === "dark" ? "#1A1A2F" : "#D9D9D9"),
                      width: 40,
                      height: 40,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 50,
                    }}>
                      <tab.icon
                        name={currentPage === tab.name ? tab.iconName[1] : tab.iconName[0]}
                        size={20}
                        color={currentPage === tab.name ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : inactiveColor}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </WebSocketProvider>
    </ErrorBoundary>
  );
}