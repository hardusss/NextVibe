// @ts-ignore
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme, DynamicColorIOS } from "react-native";

export default function IOSTabsLayout() {
    const colorScheme = useColorScheme();

    return (
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <NativeTabs
                tintColor={DynamicColorIOS({ dark: "#A855F7", light: "#7c3aed" })}
                labelStyle={{ color: DynamicColorIOS({ dark: "#F3EEFF", light: "#1A1225" }) }}
            >
                <NativeTabs.Trigger name="home">
                    <Label>Home</Label>
                    <Icon sf={{ default: "house", selected: "house.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="search" role="search">
                    <Label>Search</Label>
                    <Icon sf="magnifyingglass" />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="vibe-map">
                    <Label>Map</Label>
                    <Icon sf={{ default: "map", selected: "map.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="camera">
                    <Label hidden />
                    <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="profile">
                    <Label>Profile</Label>
                    <Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
                </NativeTabs.Trigger>
            </NativeTabs>
        </ThemeProvider>
    );
}
