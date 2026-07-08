import { Stack } from "expo-router";
import ButtonSettings from "@/components/ProfilePage/ButtonSettings";
import ButtonWallet from "@/components/ProfilePage/ButtonWallet";

export default function ProfileStackLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerTitle: "Profile",
                    headerLargeTitle: true,
                    headerShadowVisible: false,
                    headerTransparent: true,
                    headerBlurEffect: "prominent",
                    headerLeft: () => <ButtonSettings />,
                    headerRight: () => <ButtonWallet />,
                }}
            />
        </Stack>
    );
}
