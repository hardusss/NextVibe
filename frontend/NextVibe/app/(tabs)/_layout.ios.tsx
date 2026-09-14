import { NativeTabs } from "expo-router/unstable-native-tabs";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme, DynamicColorIOS } from "react-native";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";

export default function IOSTabsLayout() {
    const colorScheme = useColorScheme();
    const unreadMessages = useUnreadMessagesCount();
    const chatBadge = unreadMessages > 99 ? "99+" : String(unreadMessages);

    return (
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <NativeTabs
                tintColor={DynamicColorIOS({ dark: "#ffffffff", light: "#000000ff" })}
                badgeBackgroundColor="#A855F7"
                badgeTextColor="#ffffff"
            >
                <NativeTabs.Trigger name="home">
                    <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
                    <NativeTabs.Trigger.Label>{""}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="search">
                    <NativeTabs.Trigger.Icon sf="magnifyingglass" />
                    <NativeTabs.Trigger.Label>{""}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="vibe-map">
                    <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} />
                    <NativeTabs.Trigger.Label>{""}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="chats">
                    <NativeTabs.Trigger.Icon sf={{ default: "message", selected: "message.fill" }} />
                    {unreadMessages > 0 && (
                        <NativeTabs.Trigger.Badge>{chatBadge}</NativeTabs.Trigger.Badge>
                    )}
                    <NativeTabs.Trigger.Label>{""}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="profile">
                    <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
                    <NativeTabs.Trigger.Label>{""}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>
            </NativeTabs>
        </ThemeProvider>
    );
}
