import { Stack } from "expo-router";
import HomeHeaderTitle from "@/components/Home/HomeHeaderTitle";

export default function HomeStackLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => <HomeHeaderTitle />,
                    headerBackVisible: false,
                    headerShadowVisible: false,
                }}
            />
        </Stack>
    );
}
