import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import getUserDetail from "@/src/api/user.detail";
import { useEffect, useState } from "react";
import { Image } from "react-native";
import GetApiUrl from "@/src/utils/url_api";
import { useSegments } from "expo-router";


export default function Layout() {
    const theme = useColorScheme();
    const activeColor = "#7B61FF"; 
    const inactiveColor = theme === "dark" ?  "#fafafa" : "black"; 
    const [imageProfile, setImageProfile] = useState<string | null>(null);
    const segments = useSegments();
    const currentPage = segments[segments.length - 1];
    const blacklist = ["register", "login", "postslist", "splash", "index", "create-post", "settings", "wallet", "select-token", "deposit", "transaction", "user-profile", "create-wallet", "result-transaction", "transactions", "transaction-detail"];
    useEffect(() => {
        if (blacklist.includes(currentPage)) {
            return;
        }
        const getImageProfile = async () => {
            try {
                const data = await getUserDetail();
                if (data.avatar) {
                    setImageProfile(`${GetApiUrl().slice(0, 26)}${data.avatar}`);
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
                    backgroundColor: theme === "dark" ? "black" : "#ffffff", //"#0a0c1a"
                    position: "absolute",
                    height: 70,
                    borderTopWidth: 1,
                    borderColor: "#05f0d8", // #5A31F4
                    elevation: 10,
                    shadowOpacity: 1,
                    shadowRadius: 20,
                    shadowColor: "#7B61FF",
                    shadowOffset: { width: 0, height: 5 },
                    display: [...blacklist, "camera"].includes(currentPage) ? "none": "flex",
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
                name="camera"
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
                                    borderColor: "#05f0d8",
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
            
            {
                blacklist.map((item) => {
                    return <Tabs.Screen key={item} name={item} options={{ href: null }} />
                })
            }
            
        </Tabs>
    );
}
