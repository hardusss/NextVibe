import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

export default function SearchStackLayout() {
    const isDark = useColorScheme() === "dark";
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerTitle: "Search",
                    headerLargeTitle: true,
                    headerShadowVisible: false,
                    headerTransparent: true,
                    headerBlurEffect: isDark ? "systemChromeMaterialDark" : "systemChromeMaterial",
                    headerLargeTitleShadowVisible: false,
                }}
            />
        </Stack>
    );
}
