import { View, TouchableOpacity, Text, Animated } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EdgeInsets } from "react-native-safe-area-context";
import { useEffect, useRef } from "react";
import createDepositStyles from "@/styles/deposit.styles";

/**
 * Props for the Header component
 */
type HeaderProps = {
    /** The title text displayed in the header */
    title: string;
    /** Theme flag - true for dark mode, false for light mode */
    isDark: boolean;
    /** Safe area insets for proper spacing on different devices */
    insets: EdgeInsets;
    /** Callback fired when the back button is pressed */
    onBack: () => void;
    /** Animate flag - true for animated header mode, false for not animated mode */
    animated?: boolean;
};

/**
 * Animated header component with blur effect and back navigation
 * 
 * Features a fade-in animation on mount, themed blur background for the back button,
 * and safe area handling for notched devices.
 * 
 * @param props - Component properties
 * @returns Rendered header with back button and title
 * 
 * @example
 * ```tsx
 * <Header
 *   title="Deposit"
 *   isDark={true}
 *   insets={safeAreaInsets}
 *   onBack={() => navigation.goBack()}
 *   animated={true}
 * />
 * ```
 */
export default function Header({
    title,
    isDark,
    insets,
    onBack,
    animated = false
}: HeaderProps): JSX.Element {
    const styles = createDepositStyles(isDark, insets);
    const fadeAnim = useRef<Animated.Value>(
        new Animated.Value(animated ? 0 : 1)
    ).current;

    useEffect(() => {
        if (!animated) return;

        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, [animated, fadeAnim]);


    return (
        <Animated.View
            style={[
                styles.header,
                animated && { opacity: fadeAnim }
            ]}
        >
            <View style={styles.backButtonShadow}>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    onPress={onBack}
                    style={styles.backButton}
                    activeOpacity={0.7}
                >
                    <BlurView
                        intensity={isDark ? 40 : 80}
                        tint={isDark ? 'dark' : 'light'}
                        style={styles.blurViewAbsolute}
                    />
                    <MaterialCommunityIcons
                        name="arrow-left"
                        size={24}
                        color={isDark ? '#FFF' : '#5B21B6'}
                    />
                </TouchableOpacity>
            </View>
            <Text style={styles.title}>{title}</Text>
        </Animated.View>
    );
}