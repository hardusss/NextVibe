import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import createIntroStyles, { BUTTON_CONSTANTS } from '@/styles/intro.styles';

/**
 * Props for the SwipeButton component
 */
interface SwipeButtonProps {
    /** Callback fired when swipe gesture is completed successfully */
    onTrigger: () => void;
    /** Theme flag - true for dark mode, false for light mode */
    isDarkMode: boolean;
}

/**
 * Interactive swipe-to-activate button with haptic feedback
 * 
 * Features a draggable knob that users must swipe across a track to activate.
 * Provides rich user feedback through:
 * - Haptic vibrations on touch and completion
 * - Smooth spring animations for natural movement
 * - Text fade-out as the knob slides
 * - Loading state during async operations
 * - Auto-reset on error or completion
 * 
 * The button requires users to swipe at least 85% across the track to trigger
 * the action, preventing accidental activations. If released before the threshold,
 * the knob springs back to the start position.
 * 
 * @param props - Component properties
 * @returns Rendered swipe button with gesture handling
 * 
 * @example
 * ```tsx
 * <SwipeButton
 *   onTrigger={async () => {
 *     await connectWallet();
 *     router.push('/home');
 *   }}
 *   isDarkMode={true}
 * />
 * ```
 */
export default function SwipeButton({
    onTrigger,
    isDarkMode
}: SwipeButtonProps) {
    const styles = createIntroStyles(isDarkMode);
    const translateX = useSharedValue(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    const gradientColors = isDarkMode
        ? ['#A78BFA', '#7C3AED'] as const
        : ['#5856D6', '#7C3AED'] as const;

    /**
     * Handles completion of the swipe gesture
     * 
     * Triggers haptic feedback, executes the onTrigger callback, and handles
     * errors by resetting the button state. Always resets to initial position
     * after completion or error.
     */
    const handleComplete = async () => {
        setIsLoading(true);
        setIsComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        try {
            await onTrigger();
        } catch (error) {
            console.log("Action cancelled, resetting button");
            setIsLoading(false);
            setIsComplete(false);
            translateX.value = withSpring(0, { damping: 15 });
        } finally {
            setIsLoading(false);
            setIsComplete(false);
            translateX.value = withSpring(0, { damping: 15 });
        }
    };

    /**
     * Pan gesture handler for the swipe interaction
     * 
     * - onBegin: Provides initial haptic feedback
     * - onChange: Constrains knob movement within track bounds
     * - onEnd: Completes action if threshold met (85%), otherwise resets
     */
    const panGesture = Gesture.Pan()
        .onBegin(() => {
            if (isComplete) return;
            runOnJS(Haptics.selectionAsync)();
        })
        .onChange((event) => {
            if (isComplete) return;
            translateX.value = Math.min(
                Math.max(event.translationX, 0),
                BUTTON_CONSTANTS.MAX_SLIDE
            );
        })
        .onEnd(() => {
            if (isComplete) return;

            if (translateX.value > BUTTON_CONSTANTS.MAX_SLIDE * 0.85) {
                translateX.value = withSpring(BUTTON_CONSTANTS.MAX_SLIDE, { damping: 12 });
                runOnJS(handleComplete)();
            } else {
                translateX.value = withSpring(0, { damping: 15 });
            }
        });

    // Knob position animation
    const animatedKnobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    // Text fade-out as knob slides
    const animatedTextStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            translateX.value,
            [0, BUTTON_CONSTANTS.MAX_SLIDE / 2],
            [1, 0],
            Extrapolation.CLAMP
        ),
        transform: [{
            translateX: interpolate(
                translateX.value,
                [0, BUTTON_CONSTANTS.MAX_SLIDE],
                [0, 20],
                Extrapolation.CLAMP
            )
        }]
    }));

    // Arrow fade-out at swipe start
    const animatedArrowStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            translateX.value,
            [0, BUTTON_CONSTANTS.MAX_SLIDE * 0.1],
            [1, 0],
            Extrapolation.CLAMP
        )
    }));

    return (
        <View style={styles.swipeTrack}>
            {/* Instruction text with fade animation */}
            <Animated.View style={[styles.swipeTextContainer, animatedTextStyle]}>
                <Text style={styles.swipeText}>Swipe to Activate</Text>
                <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    style={{ marginLeft: 4 }}
                />
            </Animated.View>

            {/* Draggable knob with gradient background */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.swipeKnob, animatedKnobStyle]}>
                    <LinearGradient
                        colors={gradientColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.knobGradient}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Animated.View style={animatedArrowStyle}>
                                <Ionicons name="arrow-forward" size={24} color="#FFF" />
                            </Animated.View>
                        )}
                    </LinearGradient>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}