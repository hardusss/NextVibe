import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import getUserDetail from "@/src/api/user.detail";
import { useEffect, useState } from "react";
import { Image } from "react-native";
import GetApiUrl from "@/src/utils/url_api";


export default function Layout() {
    const theme = useColorScheme();
    const activeColor = "#7B61FF"; 
    const inactiveColor = "#7B61FF55"; 
    const [imageProfile, setImageProfile] =  useState<string | null>(null);

    useEffect(() => {
        const getImageProfile = async () => {
            try {
                const data = await getUserDetail();
                if (data.avatar) {
                    setImageProfile(`${GetApiUrl().slice(0, 25)}${data.avatar}`);
                }
            } catch (error) {
                console.error("Error get avatar", error);
            }
        };

        getImageProfile();
    }, []);

    return (
        <Tabs
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: theme === "dark" ? "#0F0E17" : "#ffffff",
                    position: "absolute",
                    bottom: 20,
                    left: 20,
                    right: 20,
                    height: 70,
                    borderRadius: 25,
                    borderWidth: 2,
                    borderColor: "#7B61FF",
                    elevation: 10,
                    shadowOpacity: 1,
                    shadowRadius: 20,
                    shadowColor: "#7B61FF",
                    shadowOffset: { width: 0, height: 5 },
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                },
                tabBarShowLabel: false,
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Ionicons
                            name="home-outline"
                            size={30}
                            color={focused ? "#0aaac9" : inactiveColor}
                            style={{
                                textShadowColor: "#0aaac9",
                                textShadowRadius: focused ? 10 : 0,
                                textShadowOffset: { width: 0, height: 0 },
                                marginBottom: -25,
                            }}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Ionicons
                            name="search-outline"
                            size={30}
                            color={focused ? activeColor : inactiveColor}
                            style={{
                                textShadowColor: "#050bb3",
                                textShadowRadius: focused ? 10 : 0,
                                textShadowOffset: { width: 0, height: 0 },
                                marginBottom: -25,
                            }}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="create-post"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Ionicons
                            name="add-circle-outline"
                            size={34}
                            color={focused ? "#FF61FF" : inactiveColor}
                            style={{
                                textShadowColor: "#FF61FF",
                                textShadowRadius: focused ? 10 : 0,
                                textShadowOffset: { width: 0, height: 0 },
                                marginBottom: -25,
                            }}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    tabBarIcon: ({ focused }) =>
                        imageProfile ? (
                            <Image
                                source={{ uri: imageProfile }}
                                style={{
                                    width: 35,
                                    height: 35,
                                    borderRadius: 50,
                                    borderWidth: focused ? 2 : 0,
                                    borderColor: activeColor,
                                    marginBottom: -25,
                                }}
                            />
                        ) : (
                            <Ionicons
                                name="person-outline"
                                size={30}
                                color={focused ? activeColor : inactiveColor}
                                style={{
                                    textShadowColor: activeColor,
                                    textShadowRadius: focused ? 10 : 0,
                                    textShadowOffset: { width: 0, height: 0 },
                                    marginBottom: -25,
                                }}
                            />
                        ),
                }}
            />
            
            <Tabs.Screen name="login" options={{ href: null }} />
            <Tabs.Screen name="register" options={{ href: null }} />
            <Tabs.Screen name="index" options={{ href: null }} />
        </Tabs>
    );
}
