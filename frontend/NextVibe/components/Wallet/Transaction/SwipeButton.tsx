import React, { useRef, useEffect } from "react";
import { 
  Animated, 
  View, 
  StyleSheet, 
  PanResponder, 
  Dimensions, 
  Vibration, 
  Keyboard 
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import createTransactionStyles from "@/styles/create.transaction.style";

/**
 * Props for the SwipeButton component.
 */
interface SwipeButtonProps {
  /** Callback triggered when the swipe gesture is fully completed */
  onSwipeSuccess: () => void;
  /** State indicating transaction processing (shows spinner) */
  isLoading: boolean;
  /** State indicating successful transaction (shows checkmark) */
  isSuccess: boolean;
  /** State indicating failed transaction (shows error cross and resets) */
  isFailed: boolean;
  /** Controls the theme of the button (Dark/Light) */
  isDark: boolean;
  /** Optional custom text to display on the button */
  text?: string;
}

/**
 * SwipeButton Component
 * * A slide-to-confirm button with haptic feedback and state-driven animations.
 * Used for critical actions like sending transactions to prevent accidental clicks.
 * * Features:
 * - Drag physics using PanResponder
 * - Haptic feedback (vibration) during drag
 * - Loading, Success, and Failure states with animations
 * - "Breathing" text animation for visual guidance
 * * @component
 */
export const SwipeButton: React.FC<SwipeButtonProps> = ({ 
    onSwipeSuccess, 
    isLoading, 
    isSuccess, 
    isFailed, 
    isDark,
}) => {
    const styles = createTransactionStyles(isDark);

    // --- Constants ---
    const screenWidth = Dimensions.get('window').width;
    const SWIPE_AREA_WIDTH = screenWidth - 40; // Total width container
    const SWIPE_BUTTON_WIDTH = 60; // Width of the draggable circle
    const SWIPE_THRESHOLD = SWIPE_AREA_WIDTH * 0.75; // Distance required to trigger action

    // --- Animated Values ---
    const breathingAnim = useRef(new Animated.Value(1)).current;
    const textOpacity = useRef(new Animated.Value(1)).current;
    const pan = useRef(new Animated.ValueXY()).current; // X, Y position of button
    const successScale = useRef(new Animated.Value(0)).current;
    const loadingRotation = useRef(new Animated.Value(0)).current;

    // --- State Refs (Mutable values without re-renders) ---
    const panXValue = useRef(0);
    const prevGestureX = useRef(0);
    const lastVibrationTime = useRef(0);

    // --- 1. Breathing Animation Effect ---
    // Creates a pulsing opacity effect on the "Swipe to send" text
    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(breathingAnim, { 
                    toValue: 0.7, 
                    duration: 1500, 
                    useNativeDriver: true 
                }),
                Animated.timing(breathingAnim, { 
                    toValue: 1, 
                    duration: 1500, 
                    useNativeDriver: true 
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [breathingAnim]);

    // --- 2. Loading Animation Effect ---
    // Rotates the spinner when isLoading is true
    useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.timing(loadingRotation, { 
                    toValue: 1, 
                    duration: 1000, 
                    useNativeDriver: true 
                })
            ).start();
        } else {
            loadingRotation.stopAnimation();
            loadingRotation.setValue(0);
        }
    }, [isLoading, loadingRotation]);

    // --- 3. Success Animation Effect ---
    // Scales up the checkmark icon on success
    useEffect(() => {
        if (isSuccess) {
            Animated.spring(successScale, { 
                toValue: 1, 
                useNativeDriver: true 
            }).start();
        } else {
            successScale.setValue(0);
        }
    }, [isSuccess, successScale]);

    // --- 4. Failure/Reset Effect ---
    // Automatically resets the button position after showing failure state
    useEffect(() => {
        if (isFailed) {
            const timer = setTimeout(() => {
                resetSwipe();
            }, 2000); 
            return () => clearTimeout(timer);
        }
    }, [isFailed]);

    // Sync Pan Value listener
    useEffect(() => {
        const listenerId = pan.x.addListener(c => { panXValue.current = c.value; });
        return () => { pan.x.removeListener(listenerId); };
    }, [pan.x]);

    /**
     * Resets the swipe button to its initial position with spring animation
     */
    const resetSwipe = () => {
        Animated.parallel([
            Animated.spring(pan, { 
                toValue: { x: 0, y: 0 }, 
                useNativeDriver: true 
            }),
            Animated.timing(textOpacity, { 
                toValue: 1, 
                duration: 300, 
                useNativeDriver: true 
            })
        ]).start();
    };

    /**
     * PanResponder Configuration
     * Handles the touch gestures for the swipe button
     */
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            
            onPanResponderGrant: () => {
                // Reset gesture tracking on touch start
                prevGestureX.current = 0;
                pan.setOffset({ x: panXValue.current, y: 0 });
                pan.setValue({ x: 0, y: 0 });
            },

            onPanResponderMove: (_, gesture) => {
                const now = Date.now();
                const moveDelta = gesture.dx - prevGestureX.current;

                // 1. Handle Movement Limits
                // Only allow movement to the right and within container bounds
                if (gesture.dx > 0 && gesture.dx < SWIPE_AREA_WIDTH - SWIPE_BUTTON_WIDTH) {
                    pan.setValue({ x: gesture.dx, y: 0 });
                    
                    // Fade out text as user drags
                    const opacity = 1 - (gesture.dx / (SWIPE_AREA_WIDTH / 2));
                    textOpacity.setValue(Math.max(0, opacity));
                }

                // 2. Handle Haptic Feedback (Vibration)
                // Vibrates when dragging aggressively to simulate physical resistance
                if (now - lastVibrationTime.current > 60) {
                    if (moveDelta > 2) {
                        const progress = gesture.dx / SWIPE_AREA_WIDTH;
                        if (progress > 0.2) {
                            let duration = 5;
                            // Intensify vibration near the end
                            if (progress > 0.8) duration = 25;
                            else if (progress > 0.5) duration = 15;
                            
                            Vibration.vibrate(duration);
                            lastVibrationTime.current = now;
                        }
                    }
                }
                prevGestureX.current = gesture.dx;
            },

            onPanResponderRelease: (_, gesture) => {
                pan.flattenOffset();
                
                // Check if threshold reached
                if (gesture.dx > SWIPE_THRESHOLD) {
                    Vibration.vibrate(50); // Success haptic
                    Keyboard.dismiss();
                    onSwipeSuccess();
                } else {
                    resetSwipe(); // Snap back if not far enough
                }
            }
        })
    ).current;

    return (
        <View style={styles.swipeButtonContainer}>
            {/* Background Blur */}
            <BlurView 
                intensity={isDark ? 30 : 90} 
                tint={isDark ? 'dark' : 'light'} 
                style={[styles.blurViewAbsolute, { borderRadius: 32 }]} 
            />
            
            {/* Hint Text ("Swipe to send") */}
            <Animated.Text 
                style={[
                    styles.swipeText, 
                    { opacity: isSuccess || isLoading || isFailed ? 0 : textOpacity }
                ]}
            >
                Swipe to send
            </Animated.Text>
            
            {/* Failure Text Overlay */}
            <Animated.Text 
                style={[
                    styles.swipeText, 
                    { opacity: breathingAnim, position: 'absolute' }
                ]}
            >
                {isFailed && !isLoading ? 'Failed' : ''}
            </Animated.Text>

            {/* Draggable Button Knob */}
            <Animated.View
                style={[
                    styles.swipeButton, 
                    { transform: [{ translateX: pan.x }] }
                ]}
                {...(!isSuccess && !isLoading && !isFailed && panResponder.panHandlers)}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
                <LinearGradient 
                    colors={['#A78BFA', '#5856D6']} 
                    style={styles.swipeButtonGradient} 
                />
                <MaterialCommunityIcons 
                    name="chevron-double-right" 
                    size={30} 
                    color="#fff" 
                />
            </Animated.View>
            
            {/* Status Overlay (Loading / Success / Fail) */}
            {(isSuccess || isLoading || isFailed) && (
                <Animated.View style={[
                    StyleSheet.absoluteFill, 
                    styles.swipeButtonContainer, 
                    { 
                        width: "100%", 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        backgroundColor: isSuccess ? '#2ECC71' : isFailed ? '#E74C3C' : 'transparent', 
                        marginLeft: -23
                    }
                ]}>
                    {isLoading && (
                        <Animated.View 
                            style={{
                                transform: [{
                                    rotate: loadingRotation.interpolate({
                                        inputRange: [0, 1], 
                                        outputRange: ['0deg', '360deg']
                                    })
                                }]
                            }}
                        >
                            <MaterialCommunityIcons name="loading" size={32} color="#fff" />
                        </Animated.View>
                    )}

                    {isSuccess && (
                        <Animated.View style={{ transform: [{ scale: successScale }] }}>
                            <MaterialCommunityIcons name="check" size={32} color="#fff" />
                        </Animated.View>
                    )}

                    {isFailed && !isLoading && (
                        <MaterialCommunityIcons name="close" size={32} color="#fff" />
                    )}
                </Animated.View>
            )}
        </View>
    );
};