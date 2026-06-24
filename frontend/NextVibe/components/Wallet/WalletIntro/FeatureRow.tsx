import React from 'react';
import { View, Text } from 'react-native';
import { FileText, Fingerprint, Zap, CheckCircle2 } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import createIntroStyles from '@/styles/intro.styles';

/**
 * Props for the FeatureRow component
 */
type FeatureProps = {
    /** Feature icon type */
    iconType: 'document' | 'fingerprint' | 'flash';
    /** Feature description text */
    text: string;
    /** Animation delay in milliseconds for staggered entrance */
    delay: number;
    /** Theme flag - true for dark mode, false for light mode */
    isDarkMode: boolean;
};

/**
 * Animated feature list item with icon and checkmark
 * 
 * Displays a single feature in an intro or onboarding flow, featuring:
 * - Leading icon representing the feature
 * - Descriptive text in the center
 * - Trailing checkmark indicator
 * - Blur background effect for modern aesthetics
 * - Staggered spring animation entrance
 * 
 * Typically used in a vertical list to showcase app capabilities or benefits
 * during the onboarding experience.
 * 
 * @param props - Component properties
 * @returns Rendered feature row with animation
 * 
 * @example
 * ```tsx
 * <FeatureRow
 *   iconType="document"
 *   text="Bank-level security"
 *   delay={200}
 *   isDarkMode={true}
 * />
 * ```
 */
export default function FeatureRow({
    iconType,
    text,
    delay,
    isDarkMode
}: FeatureProps): JSX.Element {
    const styles = createIntroStyles(isDarkMode);
    const iconColor = isDarkMode ? '#A78BFA' : '#5856D6';

    return (
        <Animated.View
            entering={FadeInDown.delay(delay).springify()}
            style={styles.featureContainer}
        >
            <BlurView
                intensity={isDarkMode ? 20 : 40}
                tint={isDarkMode ? 'dark' : 'light'}
                style={styles.featureBlur}
            >
                {/* Feature icon */}
                <View style={styles.featureIconBox}>
                    {iconType === 'document' && <FileText size={22} color={iconColor} />}
                    {iconType === 'fingerprint' && <Fingerprint size={22} color={iconColor} />}
                    {iconType === 'flash' && <Zap size={22} color={iconColor} />}
                </View>

                {/* Feature description */}
                <Text style={styles.featureText}>{text}</Text>

                {/* Checkmark indicator */}
                <CheckCircle2
                    size={18}
                    color={isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0,0,0,0.3)'}
                />
            </BlurView>
        </Animated.View>
    );
}