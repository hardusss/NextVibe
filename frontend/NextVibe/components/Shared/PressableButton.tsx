import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MOTION } from '@/constants/motion';

interface PressableButtonProps {
    onPress: () => void;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /** Haptic feedback style upon press. Default: 'selection' */
    haptic?: 'selection' | 'light' | 'medium' | 'heavy' | 'none';
    /** Custom scale factor on press. Default: MOTION.press.scale (0.97) */
    pressScale?: number;
    disabled?: boolean;
    hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
    /** Android ripple on press (rows/cards). iOS keeps the scale-down. */
    ripple?: boolean;
}

const ANDROID_RIPPLE = { color: 'rgba(168,85,247,0.2)', borderless: false } as const;

export const PressableButton: React.FC<PressableButtonProps> = ({
    onPress,
    children,
    style,
    haptic = 'selection',
    pressScale = MOTION.press.scale,
    disabled = false,
    hitSlop,
    ripple = false,
}) => {
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const triggerHaptic = () => {
        if (haptic === 'none') return;
        if (haptic === 'selection') {
            Haptics.selectionAsync();
        } else {
            const styleMap = {
                light: Haptics.ImpactFeedbackStyle.Light,
                medium: Haptics.ImpactFeedbackStyle.Medium,
                heavy: Haptics.ImpactFeedbackStyle.Heavy,
            };
            Haptics.impactAsync(styleMap[haptic]);
        }
    };

    return (
        <Pressable
            onPress={() => {
                if (!disabled) {
                    triggerHaptic();
                    onPress();
                }
            }}
            onPressIn={() => {
                if (!disabled) {
                    scale.value = withSpring(pressScale, MOTION.spring.snappy);
                }
            }}
            onPressOut={() => {
                scale.value = withSpring(1, MOTION.spring.snappy);
            }}
            hitSlop={hitSlop}
            disabled={disabled}
            android_ripple={ripple && Platform.OS === 'android' ? ANDROID_RIPPLE : undefined}
        >
            <Animated.View style={[animStyle, style]}>
                {children}
            </Animated.View>
        </Pressable>
    );
};

export default PressableButton;
