import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing
} from 'react-native-reanimated';
import createIntroStyles from '@/styles/intro.styles';

/**
 * Props for the HeaderSection component
 */
type HeaderSectionProps = {
    /** Theme flag - true for dark mode, false for light mode */
    isDarkMode: boolean;
};

/**
 * Animated header section for intro/onboarding screen
 * 
 * Displays the app branding with:
 * - Large shield icon with subtle breathing animation (scale pulse)
 * - App name (NextVibe Wallet)
 * - Tagline/subtitle
 * - Fade-in entrance animation
 * 
 * The shield icon continuously pulses between 100% and 105% scale to create
 * a subtle, engaging visual effect that draws attention without being distracting.
 * 
 * @param props - Component properties
 * @returns Rendered header section with animated branding
 * 
 * @example
 * ```tsx
 * <HeaderSection isDarkMode={true} />
 * ```
 */
export default function HeaderSection({
    isDarkMode
}: HeaderSectionProps): JSX.Element {
    const styles = createIntroStyles(isDarkMode);
    const scale = useSharedValue(1);
    const iconColor = isDarkMode ? '#A78BFA' : '#5856D6';

    // Setup breathing animation for shield icon
    useEffect(() => {
        scale.value = withRepeat(
            withTiming(1.05, {
                duration: 2500,
                easing: Easing.inOut(Easing.ease)
            }),
            -1, // Infinite repeat
            true // Reverse (ping-pong effect)
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View
            entering={FadeInDown.delay(100).duration(800)}
            style={styles.headerContainer}
        >
            {/* Animated shield icon */}
            <Animated.View style={[styles.iconWrapper, animatedStyle]}>
                <Ionicons name="shield-checkmark" size={64} color={iconColor} />
            </Animated.View>

            {/* App name */}
            <Text style={styles.title}>NextVibe Wallet</Text>

            {/* Tagline */}
            <Text style={styles.subtitle}>
                The secure vault for your social assets.
            </Text>
        </Animated.View>
    );
}