// @ts-ignore
import { NativeTabs, Icon } from "expo-router/unstable-native-tabs";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme, DynamicColorIOS } from "react-native";

export default function IOSTabsLayout() {
    const colorScheme = useColorScheme();

    return (
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <NativeTabs
                tintColor={DynamicColorIOS({ dark: "#A855F7", light: "#7c3aed" })}
            >
                <NativeTabs.Trigger name="home">
                    <Icon sf={{ default: "house", selected: "house.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="search">
                    <Icon sf="magnifyingglass" />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="vibe-map">
                    <Icon sf={{ default: "map", selected: "map.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="camera">
                    <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
                </NativeTabs.Trigger>

                <NativeTabs.Trigger name="profile">
                    <Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
                </NativeTabs.Trigger>
            </NativeTabs>
        </ThemeProvider>
    );
}