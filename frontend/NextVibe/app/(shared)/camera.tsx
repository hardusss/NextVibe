import { Platform } from "react-native";

const CameraScreen = Platform.OS === "ios"
    ? require("@/components/Camera/OpenCamera.ios").default
    : require("@/components/Camera/OpenCamera.android").default;

export default function CameraScreenRoute() {
    return <CameraScreen />;
}
