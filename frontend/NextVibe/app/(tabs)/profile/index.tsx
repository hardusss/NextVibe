// @ts-ignore
import ProfileView from "@/components/ProfilePage/ProfilePage";
import { SwipeBackWrapper } from "@/components/Shared/SwipeBackWrapper";


export default function ProfileScreen() {
    return (
        <SwipeBackWrapper>
            <ProfileView />
        </SwipeBackWrapper>
    );
}