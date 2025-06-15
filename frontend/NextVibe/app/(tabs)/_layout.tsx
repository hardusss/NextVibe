import { Tabs } from "expo-router";
import { FontAwesome5, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme, View } from "react-native";
import getUserDetail from "@/src/api/user.detail";
import { useEffect, useState } from "react";
import GetApiUrl from "@/src/utils/url_api";
import { useSegments } from "expo-router";
import FastImage from 'react-native-fast-image';



export default function Layout() {

    const theme = useColorScheme();
    const activeColor = "#7B61FF"; 
    const inactiveColor = theme === "dark" ?  "#fafafa" : "black"; 
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const segments = useSegments();
    const currentPage = segments[segments.length - 1];
    const blacklist = ["register", "login",
                        "postslist", "splash",
                        "index", "create-post",
                        "settings", "wallet",
                        "select-token", "deposit",
                        "transaction", "user-profile",
                        "create-wallet", "result-transaction",
                        "transactions", "transaction-detail",
                        "chat-room", "chats"];
    useEffect(() => {
        if (blacklist.includes(currentPage)) {
            return;
        }
        const getImageProfile = async () => {
            try {
                const data = await getUserDetail();
                if (data.avatar) {
                    setImageProfile(`${GetApiUrl().slice(0, 25)}${data.avatar}`);
                }
            } catch (error) {
                
            }
        };

        getImageProfile();
    }, [currentPage]);

    
    return (
        <Tabs
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: theme === "dark" ? "#1A1A2F" : "#D9D9D9", 
                    position: "absolute",
                    height: 60,
                    bottom: 10,
                    width: "90%",
                    marginLeft: "5%",
                    borderRadius: 20,
                    borderWidth: 1, 
                    borderColor: theme === "dark" ? "rgba(26, 26, 47, 0.95)" : "#D9D9D9", 
                    shadowColor: "transparent", 
                    elevation: 0, 
                    display: [...blacklist, "camera"].includes(currentPage) ? "none" : "flex",
                    alignItems: "center",
                    justifyContent: "center",
                },

                tabBarShowLabel: false,
                headerShown: false,
                headerShadowVisible: false
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <View style={{backgroundColor: focused ? (theme === "dark" ? "#D9D9D9": "#1A1A2F") : (theme === "dark" ? "#1A1A2F" : "#D9D9D9"), width: 40, height: 40, justifyContent: "center", alignItems: "center", marginBottom: -20, borderRadius: 50}}>
                            <MaterialCommunityIcons
                                name={focused ? "home" : "home-outline"}
                                size={20}
                                color={focused ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : inactiveColor}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <View style={{backgroundColor: focused ? (theme === "dark" ? "#D9D9D9": "#1A1A2F") : (theme === "dark" ? "#1A1A2F" : "#D9D9D9"), width: 40, height: 40, justifyContent: "center", alignItems: "center", marginBottom: -20, borderRadius: 50}}>
                            <View style={{
                                position: "relative",
                                justifyContent: "center",
                                alignItems: "center"
                            }}>
                                <View
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: 20,
                                        backgroundColor: focused ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : "transparent", 
                                        justifyContent: "center",
                                        alignItems: "center",
                                        position: "absolute",
                                        left: -6,
                                        bottom: -2
                                    }}
                                    >
                                    </View>
                                    <MaterialIcons
                                        name="search"
                                        size={20}
                                        color={focused ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : (theme === "dark" ? "#D9D9D9" : "#1A1A2F")} 
                                        style={{
                                            position: "absolute",
                                            zIndex: 9999,
                                            fontWeight: "bold"
                                        }}
                                    />
                                    

                            </View>
                            

                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="camera"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <View style={{backgroundColor: focused ? (theme === "dark" ? "#D9D9D9": "#1A1A2F") : (theme === "dark" ? "#1A1A2F" : "#D9D9D9"), width: 40, height: 40, justifyContent: "center", alignItems: "center", marginBottom: -20, borderRadius: 50}}>
                            <MaterialIcons
                                name={focused ? "add-circle" : "add-circle-outline"}
                                size={20}
                                color={focused ? (theme === "dark" ? "#1A1A2F" : "#D9D9D9") : inactiveColor}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    tabBarIcon: ({ focused }) =>
                        imageProfile ? (
                            <FastImage
                                source={{ 
                                    uri: imageProfile,
                                    priority: FastImage.priority.normal,
                                    cache: FastImage.cacheControl.immutable 
                                }}
                                style={{
                                    width: 25,
                                    height: 25,
                                    borderRadius: 50,
                                    borderWidth: focused ? 2 : 0,
                                    borderColor: "#05f0d8",
                                    marginBottom: -20,
                                }}
                            />
                        ) : (
                            <FontAwesome5
                                name="user"
                                size={20}
                                solid={focused}
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
            
            {
                blacklist.map((item) => {
                    return <Tabs.Screen key={item} name={item} options={{ href: null }} />
                })
            }
            
        </Tabs>
    );
}
