/* Mocks for the render tests (jest.components.config.js). */
jest.mock("expo-image", () => {
    const { View } = require("react-native");
    return { Image: (props) => require("react").createElement(View, { ...props, testID: props.testID ?? "expo-image" }) };
});
jest.mock("expo-haptics", () => ({
    impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
    ImpactFeedbackStyle: {}, NotificationFeedbackType: {},
}));
jest.mock("lucide-react-native", () => new Proxy({}, {
    get: (_, name) => (props) => require("react").createElement("Icon", { ...props, name: String(name) }),
}));
jest.mock("@/src/utils/haptics", () => ({
    __esModule: true, default: { impact: jest.fn(), selection: jest.fn(), notification: jest.fn() },
}));
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-linear-gradient", () => {
    const { View } = require("react-native");
    return { LinearGradient: (props) => require("react").createElement(View, props) };
});
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
