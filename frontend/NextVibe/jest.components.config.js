/**
 * Render tests for components (`npm run test:components`): the cNFT card
 * and the Proof of Meet grid tile, on React Native's own jest preset (the
 * installed jest-expo is older than this SDK). Expo modules the components
 * touch are mocked in jest.components.setup.js. The main jest config
 * (package.json) stays node-only and fast.
 */
module.exports = {
    preset: "react-native",
    roots: ["<rootDir>/components"],
    testMatch: ["**/__tests__/**/*.test.tsx"],
    setupFiles: ["<rootDir>/jest.components.setup.js"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
    },
    transform: {
        "^.+\\.[jt]sx?$": ["babel-jest", { caller: { name: "metro", bundler: "metro", platform: "ios" } }],
    },
    transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-native-svg|lucide-react-native)",
    ],
};
