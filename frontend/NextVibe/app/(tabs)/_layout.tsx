import { RelativePathString, Stack, useRouter, useSegments } from "expo-router";
import { FontAwesome5, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme, View, TouchableOpacity } from "react-native";
import { useEffect, useState } from "react";
import getUserDetail from "@/src/api/user.detail";
import FastImage from 'react-native-fast-image';
import { storage } from "@/src/utils/storage";
import { WebSocketProvider } from "@/src/context/WebSocketContext";
import axios from "axios";
import Web3Toast from "@/components/Shared/Toasts/Web3Toast";
import ErrorBoundary from 'react-native-error-boundary';
import ErrorFallback from "@/components/ErrorFallback";
<<<<<<< HEAD
import { BlurView } from "expo-blur";
=======
// Add LazorKit provider
import { LazorKitProvider } from '@lazorkit/wallet-mobile-adapter';
>>>>>>> feature/lazorkit-wallet

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

let cachedAvatarUrl: string | null = null;

export default function Layout() {
  const theme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const currentPage = segments[segments.length - 1];
  const [imageProfile, setImageProfile] = useState<string | null>(null);
  const [userID, setUserID] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(false);

  const blacklist = ["register", "login", "postslist",
                    "splash", "index", "create-post",
                    "settings", "select-token",
                    "deposit", "transaction", "user-profile",
                    "result-transaction", "transactions",
                    "transaction-detail", "chat-room", "chats",
                    "follows-screen", "notifications", "user-banned",
                    "wallet-init", "wallet-dash"];

  const tabs = [
    { name: "home", icon: MaterialCommunityIcons, iconName: ["home-outline", "home"] },
    { name: "search", icon: MaterialIcons, iconName: ["search", "search"] },
    { name: "create-post", icon: MaterialIcons, iconName: ["add-circle-outline", "add-circle"] },
    { name: "profile", icon: FontAwesome5, iconName: ["user", "user"] }
  ];

  useEffect(() => {
    const loadUserId = async () => {
      try {
        const id = await storage.getItem("id");
        if (id) {
          setUserID(Number(id));
        } else {
          setUserID(null);
          setImageProfile(null);
          cachedAvatarUrl = null;
        }
      } catch (error) {
        console.error('Error loading user ID:', error);
      }
    };
    
    loadUserId();
  }, []);

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
    if (!userID) {
      setImageProfile(null);
      cachedAvatarUrl = null;
      return;
    }

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const fetchAvatarWithRetry = async () => {
      try {
        const userData = await getUserDetail();
        const newAvatarUrl = userData.avatar || "https://media.nextvibe.io/images/default.png";
        
        if (isMounted) {
          if (newAvatarUrl !== cachedAvatarUrl) {
            if (cachedAvatarUrl !== null) {
              await FastImage.clearMemoryCache();
            }
            
            FastImage.preload([{
              uri: newAvatarUrl,
              priority: FastImage.priority.high,
            }]);

            cachedAvatarUrl = newAvatarUrl;
            setImageProfile(newAvatarUrl);
          }
        }
      } catch (error) {
        console.error(`Error loading avatar (attempt ${retryCount + 1}):`, error);
        
        if (retryCount < maxRetries && isMounted) {
          retryCount++;
          setTimeout(fetchAvatarWithRetry, 1000 * Math.pow(2, retryCount - 1));
        } else if (isMounted) {
          const defaultUrl = "https://media.nextvibe.io/images/default.png";
          cachedAvatarUrl = defaultUrl;
          setImageProfile(defaultUrl);
        }
      }
    };

    fetchAvatarWithRetry();

    return () => {
      isMounted = false;
    };
  }, [userID]);

  useEffect(() => {
    if (currentPage === "home" || currentPage === "profile") {
      const checkAndReloadUser = async () => {
        const id = await storage.getItem("id");
        const currentId = id ? Number(id) : null;

        if (currentId !== userID) {
          setUserID(currentId);
          if (!currentId) {
            setImageProfile(null);
            cachedAvatarUrl = null;
            await FastImage.clearMemoryCache();
            await FastImage.clearDiskCache();
          }
        } else if (currentId && userID) {
          try {
            const userData = await getUserDetail();
            const newAvatarUrl = userData.avatar || "https://media.nextvibe.io/images/default.png";
            
            if (newAvatarUrl !== cachedAvatarUrl) {
              await FastImage.clearMemoryCache();
              cachedAvatarUrl = newAvatarUrl;
              setImageProfile(newAvatarUrl);
            }
          } catch (error) {
            console.error('Error checking avatar update:', error);
          }
        }
      };
      
      checkAndReloadUser();
    }
  }, [currentPage, userID]);

  const goToTab = (tab: string) => {
    router.push(tab as RelativePathString);
  };

  const showTabBar = ![...blacklist, "camera"].includes(currentPage);

  return (
     <LazorKitProvider
      rpcUrl="https://devnet.helius-rpc.com/?api-key=b350b993-1ca8-4557-95aa-9e96897cce14"
      portalUrl="https://portal.lazor.sh"
      configPaymaster={{ 
        paymasterUrl: "https://kora.devnet.lazorkit.com" 
      }}
    >
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
        
        <View style={{ flex: 1, backgroundColor: theme === "dark" ? "#000" : "#fff" }}>
          <Stack screenOptions={{ headerShown: false, animation: "none" }} >
            <Stack.Screen name="home" />
            <Stack.Screen name="search" />
            <Stack.Screen name="camera" />
            <Stack.Screen name="profile" />
            {blacklist.map((item) => <Stack.Screen key={item} name={item} />)}
          </Stack>

          {showTabBar && (
            <BlurView
              intensity={40}
              tint={theme === "dark" ? "dark" : "light"}
              style={{
                position: "absolute",
                bottom: 10,
                width: "90%",
                marginLeft: "5%",
                height: 60,
                flexDirection: "row",
                justifyContent: "space-around",
                alignItems: "center",
                borderRadius: 20,
                overflow: 'hidden',
                borderColor: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                backgroundColor: theme === "dark" ? "#1e163ccd" : "#D9D9D9", 
                borderWidth: 1,
              }}
            >
              {tabs.map((tab) => {
                const isActive = currentPage === tab.name;
                
                const activeBgColor = theme === "dark" ? "#a18ed587" : "#1A1A2F";
                const inactiveBgColor = "transparent";
                
                const activeIconColor = theme === "dark" ? "#fefefe" : "#FFFFFF";
                const inactiveIconColor = theme === "dark" ? "#C4C4C4" : "#555555";

                const currentBgColor = isActive ? activeBgColor : inactiveBgColor;
                const currentIconColor = isActive ? activeIconColor : inactiveIconColor;

                return (
                  <TouchableOpacity 
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    key={tab.name} 
                    onPress={() => goToTab(tab.name)}
                    style={{ zIndex: 1 }}
                  >
                    {tab.name === "profile" && imageProfile && userID ? (
                      <FastImage
                        key={`avatar-${userID}-${imageProfile}`}
                        source={{ 
                          uri: imageProfile,
                          priority: FastImage.priority.high,
                          cache: FastImage.cacheControl.immutable,
                        }}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15, 
                          borderWidth: isActive ? 1 : 0,
                          borderColor: "#a18ed587",
                          backgroundColor: theme === "dark" ? "#2A2A3F" : "#E9E9E9",
                        }}
                        onError={() => {
                          const defaultUrl = "https://media.nextvibe.io/images/default.png";
                          cachedAvatarUrl = defaultUrl;
                          setImageProfile(defaultUrl);
                        }}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : tab.name === "search" ? (
                      <View style={{
                        position: "relative",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: currentBgColor,
                        width: 40,
                        height: 40,
                        borderRadius: 20, 
                        overflow: 'hidden', 
                      }}>
                        <MaterialIcons
                          name="search"
                          size={22}
                          color={currentIconColor}
                          style={{ zIndex: 9999 }}
                        />
                      </View>
                    ) : (
                      <View style={{
                        backgroundColor: currentBgColor,
                        width: 40,
                        height: 40,
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 20, 
                        overflow: 'hidden', 
                      }}>
                        <tab.icon
                          name={isActive ? tab.iconName[1] : tab.iconName[0]}
                          size={22}
                          color={currentIconColor}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </BlurView>
          )}
        </View>
      </WebSocketProvider>
    </ErrorBoundary>
    </LazorKitProvider>
  );
}