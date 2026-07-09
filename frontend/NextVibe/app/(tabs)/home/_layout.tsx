import { Stack } from "expo-router";
import HomeHeaderTitle from "@/components/Home/HomeHeaderTitle";
import { Platform } from "react-native";

export default function HomeStackLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerShown: Platform.OS === 'android',
                    headerTransparent: true,
                    headerTitle: () => <HomeHeaderTitle />,
                    headerBackVisible: false,
                    headerShadowVisible: false,
                }}
            />
        </Stack>
    );
}
