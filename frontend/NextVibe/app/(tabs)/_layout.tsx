import { Tabs, router } from "expo-router";
import { House, Search, UserRound, Radar, BadgePlus } from "lucide-react-native";
import { Platform } from "react-native";

export default function TabsLayout() {
    return (
        <Tabs backBehavior="history" screenOptions={{ headerShown: false, tabBarShowLabel: false }}>
            <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
            <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
            <Tabs.Screen name="vibe-map" options={{ title: "Map", tabBarIcon: ({ color, size }) => <Radar color={color} size={size} /> }} />
            <Tabs.Screen
                name="camera"
                options={{
                    href: Platform.OS === 'android' ? undefined : null,
                    title: "Camera",
                    tabBarIcon: ({ color, size }) => <BadgePlus color={color} size={size} />,
                    tabBarStyle: { display: 'none' },
                }}
                listeners={{
                    tabPress: (e) => {
                        if (Platform.OS === 'android') {
                            e.preventDefault();
                            router.push("/camera");
                        }
                    }
                }}
            />
            <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
        </Tabs>
    );
}
