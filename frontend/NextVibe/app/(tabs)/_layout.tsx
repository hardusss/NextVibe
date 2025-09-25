import { RelativePathString, Stack, useRouter, useSegments } from "expo-router";
import { FontAwesome5, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme, View, TouchableOpacity } from "react-native";
import { useEffect, useState } from "react";
import getUserDetail from "@/src/api/user.detail";
import GetApiUrl from "@/src/utils/url_api";
import FastImage from 'react-native-fast-image';

export default function Layout() {
  const theme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const currentPage = segments[segments.length - 1];
  const inactiveColor = theme === "dark" ? "#fafafa" : "black";
  const [imageProfile, setImageProfile] = useState<string | null>(null);

  const blacklist = ["register", "login",
    "postslist", "splash",
    "index", "create-post",
    "settings", "wallet",
    "select-token", "deposit",
    "transaction", "user-profile",
    "create-wallet", "result-transaction",
    "transactions", "transaction-detail",
    "chat-room", "chats",
    "follows-screen"
  ];

  const tabs = [
    { name: "home", icon: MaterialCommunityIcons, iconName: ["home-outline", "home"] },
    { name: "search", icon: MaterialIcons, iconName: ["search", "search"] },
    { name: "camera", icon: MaterialIcons, iconName: ["add-circle-outline", "add-circle"] },
    { name: "profile", icon: FontAwesome5, iconName: ["user", "user"] }
  ];

  useEffect(() => {
    if (blacklist.includes(currentPage)) return;
    const getImageProfile = async () => {
      try {
        const data = await getUserDetail();
        if (data.avatar) {
          setImageProfile(`${GetApiUrl().slice(0, 26)}${data.avatar}`);
        }
      } catch (error) {}
    };
    getImageProfile();
  }, [currentPage]);

  const goToTab = (tab: string) => {
    router.replace(tab as RelativePathString); 
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: "none"}} >
        <Stack.Screen name="home" />
        <Stack.Screen name="search" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="profile" />
        {blacklist.map((item) => <Stack.Screen key={item} name={item} />)}
      </Stack>

      {![...blacklist, "camera"].includes(currentPage) && (
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
                    borderColor: "#05f0d8",
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
  );
}
