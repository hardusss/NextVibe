import { Tabs } from "expo-router";
import { House, Search, BadgePlus, UserRound, Radar } from "lucide-react-native";

export default function AndroidTabsLayout() {
    return (
        <Tabs screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
            <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
            <Tabs.Screen name="vibe-map" options={{ title: "Map", tabBarIcon: ({ color, size }) => <Radar color={color} size={size} /> }} />
            <Tabs.Screen name="camera" options={{ title: "Camera", tabBarIcon: ({ color, size }) => <BadgePlus color={color} size={size} /> }} />
            <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
        </Tabs>
    );
}
