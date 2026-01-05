import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useColorScheme,
    StatusBar,
    Dimensions,
    Platform,
    ActivityIndicator,
    AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

// Lazorkit wallet adapter for Solana wallet connection management
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';


// ============================================================================
// CONSTANTS
// ============================================================================

/** Screen dimensions for responsive layout calculations */
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Flag to detect small devices (iPhone SE, etc.) for adjusted layouts */
const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;

/** Height of the swipe button track */
const BUTTON_HEIGHT = 64;

/** Width of the swipe button track - 88% of screen width for padding */
const BUTTON_WIDTH = SCREEN_WIDTH * 0.88;

/** Width of the draggable knob element */
const KNOB_WIDTH = 60;

/** Maximum horizontal distance the knob can slide (accounting for track padding) */
const MAX_SLIDE = BUTTON_WIDTH - KNOB_WIDTH - 8;

/** Deep link URL scheme for wallet initialization callback */
const APP_SCHEME = 'myapp://wallet-dash';


// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Props for the FeatureRow component
 * @interface FeatureProps
 */
interface FeatureProps {
    /** Ionicons icon name to display */
    icon: keyof typeof Ionicons.glyphMap;
    /** Feature description text */
    text: string;
    /** Animation delay in milliseconds for staggered entrance */
    delay: number;
    /** Whether dark mode is active for theme-aware styling */
    isDarkMode: boolean;
}

/**
 * Props for the SwipeButton component
 * @interface SwipeButtonProps
 */
interface SwipeButtonProps {
    /** Callback function triggered when swipe gesture completes successfully */
    onTrigger: () => void;
    /** Whether dark mode is active for theme-aware styling */
    isDarkMode: boolean;
}


// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * FeatureRow Component
 * 
 * Displays a single feature item with a glassmorphic blur effect background.
 * Features include an icon, descriptive text, and a checkmark indicator.
 * Uses React Native Reanimated for smooth entrance animations.
 * 
 * @component
 * @example
 * <FeatureRow
 *   icon="shield-checkmark"
 *   text="Biometric Security"
 *   delay={300}
 *   isDarkMode={true}
 * />
 */
const FeatureRow: React.FC<FeatureProps> = ({ icon, text, delay, isDarkMode }) => {
    // Theme-aware color definitions
    const iconColor = isDarkMode ? '#A78BFA' : '#5856D6';
    const textColor = isDarkMode ? '#E0E0E0' : '#333333';
    const bgColor = isDarkMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(88, 86, 214, 0.1)';

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
                {/* Icon container with tinted background */}
                <View style={[styles.featureIconBox, { backgroundColor: bgColor }]}>
                    <Ionicons name={icon} size={22} color={iconColor} />
                </View>
                
                {/* Feature description text */}
                <Text style={[styles.featureText, { color: textColor }]}>
                    {text}
                </Text>
                
                {/* Checkmark indicator */}
                <Ionicons 
                    name="checkmark-circle" 
                    size={18} 
                    color={isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0,0,0,0.3)'} 
                />
            </BlurView>
        </Animated.View>
    );
};

/**
 * SwipeButton Component
 * 
 * Interactive swipe-to-confirm button with gesture handling and haptic feedback.
 * The user drags a knob across the track to trigger the wallet activation.
 * 
 * Features:
 * - Pan gesture recognition with spring animations
 * - Haptic feedback on interaction
 * - Loading state during async operations
 * - Automatic reset on error or cancellation
 * - Smooth text and arrow fade animations
 * 
 * @component
 * @example
 * <SwipeButton
 *   onTrigger={handleWalletActivation}
 *   isDarkMode={true}
 * />
 */
const SwipeButton: React.FC<SwipeButtonProps> = ({ onTrigger, isDarkMode }) => {
    /** Shared value for knob horizontal position (0 to MAX_SLIDE) */
    const translateX = useSharedValue(0);
    
    /** Loading state during async wallet connection */
    const [isLoading, setIsLoading] = useState(false);
    
    /** Completion state to prevent multiple simultaneous triggers */
    const [isComplete, setIsComplete] = useState(false);

    /** Wallet disconnect function (currently unused but available) */
    const { disconnect } = useWallet();

    // Theme-aware gradient and track colors
    const gradientColors = isDarkMode 
        ? ['#A78BFA', '#7C3AED'] as const 
        : ['#5856D6', '#7C3AED'] as const;
    const trackColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const trackBorder = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    /**
     * Handles swipe completion logic
     * Triggers haptic feedback, calls the onTrigger callback, and manages state
     * Automatically resets the button on error or after completion
     */
    const handleComplete = async () => {
        setIsLoading(true);
        setIsComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        try {
            // Execute the wallet activation callback
            await onTrigger();
        } catch (error) {
            // On error (e.g., user cancellation), reset button state
            console.log("Action cancelled, resetting button");
            setIsLoading(false);
            setIsComplete(false);
            translateX.value = withSpring(0, { damping: 15 });
        } finally {
            // Always reset after operation completes
            setIsLoading(false);
            setIsComplete(false);
            translateX.value = withSpring(0, { damping: 15 });
        }
    };

    /**
     * Pan gesture configuration for draggable knob
     * - onBegin: Triggers haptic feedback
     * - onChange: Updates knob position within bounds
     * - onEnd: Determines if swipe was successful (>85% completion) or should reset
     */
    const panGesture = Gesture.Pan()
        .onBegin(() => {
            if (isComplete) return;
            runOnJS(Haptics.selectionAsync)();
        })
        .onChange((event) => {
            if (isComplete) return;
            // Clamp horizontal movement between 0 and MAX_SLIDE
            translateX.value = Math.min(Math.max(event.translationX, 0), MAX_SLIDE);
        })
        .onEnd(() => {
            if (isComplete) return;
            
            if (translateX.value > MAX_SLIDE * 0.85) {
                // Swipe threshold reached - snap to end and trigger action
                translateX.value = withSpring(MAX_SLIDE, { damping: 12 });
                runOnJS(handleComplete)();
            } else {
                // Threshold not reached - snap back to start
                translateX.value = withSpring(0, { damping: 15 });
            }
        });

    /** Animated style for knob horizontal translation */
    const animatedKnobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    /**
     * Animated style for "Swipe to Activate" text
     * Fades out and shifts as knob moves
     */
    const animatedTextStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            translateX.value,
            [0, MAX_SLIDE / 2],
            [1, 0],
            Extrapolation.CLAMP
        ),
        transform: [{
            translateX: interpolate(
                translateX.value,
                [0, MAX_SLIDE],
                [0, 20],
                Extrapolation.CLAMP
            )
        }]
    }));

    /**
     * Animated style for arrow icon inside knob
     * Quickly fades out as user begins dragging
     */
    const animatedArrowStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            translateX.value,
            [0, MAX_SLIDE * 0.1],
            [1, 0],
            Extrapolation.CLAMP
        )
    }));

    return (
        <View style={[styles.swipeTrack, { backgroundColor: trackColor, borderColor: trackBorder }]}>
            {/* Background instruction text with chevron icon */}
            <Animated.View style={[styles.swipeTextContainer, animatedTextStyle]}>
                <Text style={[styles.swipeText, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }]}>
                    Swipe to Activate
                </Text>
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
};

/**
 * HeaderSection Component
 * 
 * Displays the app branding with an animated shield icon and title.
 * The shield icon has a subtle pulsing animation for visual appeal.
 * 
 * @component
 * @example
 * <HeaderSection isDarkMode={true} />
 */
const HeaderSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    /** Shared value for icon scale animation */
    const scale = useSharedValue(1);

    /**
     * Initialize pulsing animation on mount
     * Creates an infinite loop scaling from 1 to 1.05
     */
    useEffect(() => {
        scale.value = withRepeat(
            withTiming(1.05, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, []);

    /** Animated style applying scale transformation to icon wrapper */
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    // Theme-aware styling for icon wrapper and text
    const borderColor = isDarkMode ? 'rgba(167, 139, 250, 0.3)' : 'rgba(88, 86, 214, 0.2)';
    const shadowColor = isDarkMode ? '#A78BFA' : '#5856D6';
    const iconColor = isDarkMode ? '#A78BFA' : '#5856D6';
    const titleColor = isDarkMode ? '#FFFFFF' : '#1A1A1A';

    return (
        <Animated.View entering={FadeInDown.delay(100).duration(800)} style={styles.headerContainer}>
            {/* Animated shield icon with glassmorphic container */}
            <Animated.View style={[
                styles.iconWrapper,
                animatedStyle,
                { 
                    borderColor, 
                    shadowColor,
                    backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'
                }
            ]}>
                <Ionicons name="shield-checkmark" size={64} color={iconColor} />
            </Animated.View>

            {/* App title and subtitle */}
            <Text style={[styles.title, { color: titleColor }]}>NextVibe Wallet</Text>
            <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }]}>
                The secure vault for your social assets.
            </Text>
        </Animated.View>
    );
};


// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

/**
 * WalletIntroScreen
 * 
 * Main onboarding screen for wallet activation.
 * Presents a premium UI with features list and swipe-to-activate interaction.
 * 
 * Flow:
 * 1. User views wallet features and branding
 * 2. User swipes the button to initiate wallet connection
 * 3. LazorKit SDK opens wallet provider in browser
 * 4. User authorizes connection in wallet
 * 5. App receives deep link callback
 * 6. User is redirected to main app (handled externally)
 * 
 * Edge Cases Handled:
 * - User closes browser without connecting (detected via AppState)
 * - Stale connection state from SDK (force reset)
 * - Generic connection errors (reset button state)
 * 
 * @component
 * @default
 */
export default function WalletIntroScreen() {
    /** System color scheme (light/dark) */
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    
    /** Navigation router for screen transitions */
    const router = useRouter();

    /** LazorKit wallet hooks for connection management */
    const { connect, isConnected } = useWallet();

    /**
     * Wallet activation handler with robust error handling
     * 
     * Implements a race condition between:
     * - Normal wallet connection flow
     * - User cancellation detection (via AppState monitoring)
     * 
     * This ensures the UI resets properly if the user closes
     * the browser/wallet without completing authorization.
     * 
     * @throws {Error} USER_CANCELLED - When user closes browser manually
     * @throws {Error} Generic connection errors from SDK
     */
    const handleActivateWallet = async () => {
        // Guard against stale SDK connection state
        if (useWalletStore.getState().isConnecting) {
             console.log("Stale connection detected, resetting...");
             await useWalletStore.setState({ isConnecting: false });
        }

        let appStateSubscription: any = null;
        
        /**
         * Race condition: Promise that rejects if app becomes active again
         * This indicates user likely closed the browser without connecting
         * 
         * Timeout gives SDK time to process potential successful connection
         * before assuming cancellation
         */
        const userCancelRace = new Promise<void>((_, reject) => {
             appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
                if (nextAppState === "active") {
                    console.log("App active again, check cancel...");
                    setTimeout(() => {
                        reject(new Error("USER_CANCELLED"));
                    }, 1500); 
                }
            });
        });

        try {
            // Race between normal connection and cancellation detection
            await Promise.race([
                connect({redirectUrl: APP_SCHEME}),
                userCancelRace
            ]);

        } catch (error: any) {
            if (error.message === "USER_CANCELLED") {
                console.log("User closed browser manually. Force disconnecting.");
                // Force reset SDK connection state
                useWalletStore.setState({isConnecting: false})
                
                // Re-throw to trigger SwipeButton reset animation
                throw error; 
            } else {
                // Generic connection error - reset state
                useWalletStore.setState({isConnecting: false})
                console.error("Connection Error:", error);
                throw error;
            }
        } finally {
            // Always clean up AppState listener
            if (appStateSubscription) {
                appStateSubscription.remove();
            }
        }
    };

    // Theme-aware gradient colors for background
    const bgColors = isDarkMode
        ? ['#0A0410', '#1a0a2e', '#0A0410'] as const
        : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'] as const;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient colors={bgColors} style={styles.container}>
                <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} /> 

                <View style={styles.content}>
                    {/* Top Section: Branding and Features */}
                    <View style={styles.topSection}>
                        <HeaderSection isDarkMode={isDarkMode} />

                        {/* Feature list with staggered entrance animations */}
                        <View style={styles.listContainer}>
                            <FeatureRow
                                icon="document-text-outline"
                                text="No Seed Phrase"
                                delay={300}
                                isDarkMode={isDarkMode}
                            />
                            <FeatureRow
                                icon="finger-print-outline"
                                text="Biometric Secured"
                                delay={500}
                                isDarkMode={isDarkMode}
                            />
                            <FeatureRow
                                icon="flash-outline"
                                text="Gasless Transactions"
                                delay={700}
                                isDarkMode={isDarkMode}
                            />
                        </View>
                    </View>

                    {/* Bottom Section: Swipe Action Button */}
                    <Animated.View 
                        entering={FadeInUp.delay(900).springify()} 
                        style={styles.bottomSection}
                    >
                        <SwipeButton 
                            onTrigger={handleActivateWallet}
                            isDarkMode={isDarkMode}
                        />

                        {/* Footer branding */}
                        <View style={styles.footerNote}>
                            <Ionicons 
                                name="lock-closed" 
                                size={12} 
                                color={isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} 
                            />
                            <Text style={[
                                styles.footerText, 
                                { color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }
                            ]}>
                                Powered by LazorKit Security
                            </Text>
                        </View>
                    </Animated.View>
                </View>
            </LinearGradient>
        </GestureHandlerRootView>
    );
}


// ============================================================================
// STYLESHEET
// ============================================================================

const styles = StyleSheet.create({
    // Root container with gradient background
    container: {
        flex: 1,
    },
    
    // Main content wrapper with responsive padding
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: SCREEN_WIDTH * 0.06,
        paddingTop: Platform.OS === 'ios' ? (IS_SMALL_DEVICE ? 60 : 80) : 50,
        paddingBottom: IS_SMALL_DEVICE ? 30 : 50,
    },
    
    // Top section containing header and features
    topSection: {
        flex: 1,
        alignItems: 'center',
    },
    
    // ========== Header Styles ==========
    headerContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    
    // Animated icon wrapper with glassmorphic effect
    iconWrapper: {
        width: 120,
        height: 120,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },
    
    // App title text
    title: {
        fontSize: 34,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    
    // App subtitle/tagline
    subtitle: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: '80%',
    },
    
    // ========== Feature List Styles ==========
    listContainer: {
        width: '100%',
        gap: 16,
    },
    
    // Individual feature row container
    featureContainer: {
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    
    // Blur effect background for feature rows
    featureBlur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    
    // Icon container box with tinted background
    featureIconBox: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    
    // Feature description text
    featureText: {
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
    },
    
    // ========== Bottom Section Styles ==========
    bottomSection: {
        width: '100%',
        alignItems: 'center',
    },
    
    // ========== Swipe Button Styles ==========
    
    // Track/background of swipe button
    swipeTrack: {
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        borderRadius: BUTTON_HEIGHT / 2,
        borderWidth: 1,
        justifyContent: 'center',
        marginBottom: 20,
        overflow: 'hidden',
        position: 'relative',
    },
    
    // Container for instruction text (centered)
    swipeTextContainer: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 20, // Offset for knob starting position
        zIndex: 1,
    },
    
    // "Swipe to Activate" text styling
    swipeText: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    
    // Draggable knob element
    swipeKnob: {
        width: KNOB_WIDTH,
        height: KNOB_WIDTH,
        borderRadius: KNOB_WIDTH / 2,
        position: 'absolute',
        left: 2, // Initial padding from track edge
        zIndex: 2,
    },
    
    // Gradient background for knob with shadow
    knobGradient: {
        flex: 1,
        borderRadius: KNOB_WIDTH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5, // Android shadow
    },
    
    // ========== Footer Styles ==========
    
    // Footer branding container
    footerNote: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.8,
    },
    
    // Footer text styling
    footerText: {
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 6,
    },
});