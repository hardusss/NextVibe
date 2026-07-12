// @ts-ignore
import MapScreen from "@/components/VibeMap/Map";
import { SwipeBackWrapper } from "@/components/Shared/SwipeBackWrapper";

export default function VibeMapScreen() {
    return (
        <SwipeBackWrapper>
            <MapScreen />
        </SwipeBackWrapper>
    );
}