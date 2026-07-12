// @ts-ignore
import MainPage from "@/components/Home/MainPage";
import { SwipeBackWrapper } from "@/components/Shared/SwipeBackWrapper";

export default function HomeScreen() {
    return (
        <SwipeBackWrapper>
            <MainPage />
        </SwipeBackWrapper>
    );
}