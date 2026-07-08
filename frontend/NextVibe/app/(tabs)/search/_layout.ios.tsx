import { Stack } from "expo-router";

export default function SearchStackLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerTitle: "Search",
                    headerLargeTitle: true,
                    headerShadowVisible: false,
                    headerTransparent: true,
                    headerBlurEffect: "prominent",
                }}
            />
        </Stack>
    );
}
