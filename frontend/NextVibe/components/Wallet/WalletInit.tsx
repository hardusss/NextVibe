import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useColorScheme,
    StatusBar,
    Dimensions,
    Platform,
    ActivityIndicator
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

// --- Constants ---

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;

const BUTTON_HEIGHT = 64;
const BUTTON_WIDTH = SCREEN_WIDTH * 0.88; // Width of the swipe area
const KNOB_WIDTH = 60; // Width of the draggable part
const MAX_SLIDE = BUTTON_WIDTH - KNOB_WIDTH - 8; // -8 for padding

// --- Interfaces ---

interface FeatureProps {
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    delay: number;
    isDarkMode: boolean;
}

interface SwipeButtonProps {
    onTrigger: () => void;
    isDarkMode: boolean;
}

// --- Components ---

/**
 * FeatureRow
 * Renders a single bullet point with a blurred glass effect.
 */
const FeatureRow: React.FC<FeatureProps> = ({ icon, text, delay, isDarkMode }) => {
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
                <View style={[styles.featureIconBox, { backgroundColor: bgColor }]}>
                    <Ionicons name={icon} size={22} color={iconColor} />
                </View>
                <Text style={[styles.featureText, { color: textColor }]}>
                    {text}
                </Text>
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
 * SwipeButton
 * A draggable slider to confirm activation.
 */
const SwipeButton: React.FC<SwipeButtonProps> = ({ onTrigger, isDarkMode }) => {
    const translateX = useSharedValue(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    const gradientColors = isDarkMode 
    ? ['#A78BFA', '#7C3AED'] as const 
    : ['#5856D6', '#7C3AED'] as const;
    const trackColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const trackBorder = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const handleComplete = () => {
        setIsLoading(true);
        setIsComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onTrigger();
    };

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            if (isComplete) return;
            runOnJS(Haptics.selectionAsync)();
        })
        .onChange((event) => {
            if (isComplete) return;
            // Limit movement between 0 and MAX_SLIDE
            translateX.value = Math.min(Math.max(event.translationX, 0), MAX_SLIDE);
        })
        .onEnd(() => {
            if (isComplete) return;
            
            if (translateX.value > MAX_SLIDE * 0.85) {
                // If dragged more than 85%, snap to end and trigger
                translateX.value = withSpring(MAX_SLIDE, { damping: 12 });
                runOnJS(handleComplete)();
            } else {
                // Otherwise snap back
                translateX.value = withSpring(0, { damping: 15 });
            }
        });

    const animatedKnobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

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
            {/* Background Text */}
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

            {/* Draggable Knob */}
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
 * HeaderSection
 * Displays the 3D Shield Icon and the App Title.
 */
const HeaderSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    const scale = useSharedValue(1);

    useEffect(() => {
        scale.value = withRepeat(
            withTiming(1.05, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const borderColor = isDarkMode ? 'rgba(167, 139, 250, 0.3)' : 'rgba(88, 86, 214, 0.2)';
    const shadowColor = isDarkMode ? '#A78BFA' : '#5856D6';
    const iconColor = isDarkMode ? '#A78BFA' : '#5856D6';
    const titleColor = isDarkMode ? '#FFFFFF' : '#1A1A1A';

    return (
        <Animated.View entering={FadeInDown.delay(100).duration(800)} style={styles.headerContainer}>
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

            <Text style={[styles.title, { color: titleColor }]}>NextVibe Wallet</Text>
            <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }]}>
                The secure vault for your social assets.
            </Text>
        </Animated.View>
    );
};

// --- Main Screen ---

export default function WalletIntroScreen() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const router = useRouter();

    const handleActivate = () => {
        console.log('[WalletIntro] Swipe completed - starting onboarding');
        // Small delay to let the UI finish updating before navigation
        setTimeout(() => {
            router.push('/confirm-email');
        }, 500);
    };

    const bgColors = isDarkMode
        ? ['#0A0410', '#1a0a2e', '#0A0410'] as const
        : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'] as const;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient colors={bgColors} style={styles.container}>
                <StatusBar backgroundColor={isDarkMode ? "#0A0410" : "#fff"} /> 

                <View style={styles.content}>
                    {/* Top: Branding */}
                    <View style={styles.topSection}>
                        <HeaderSection isDarkMode={isDarkMode} />

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

                    {/* Bottom: Swipe Action */}
                    <Animated.View 
                        entering={FadeInUp.delay(900).springify()} 
                        style={styles.bottomSection}
                    >
                        <SwipeButton 
                            onTrigger={handleActivate}
                            isDarkMode={isDarkMode}
                        />

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

// --- Styles ---

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: SCREEN_WIDTH * 0.06,
        paddingTop: Platform.OS === 'ios' ? (IS_SMALL_DEVICE ? 60 : 80) : 50,
        paddingBottom: IS_SMALL_DEVICE ? 30 : 50,
    },
    topSection: {
        flex: 1,
        alignItems: 'center',
    },
    // Header
    headerContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    iconWrapper: {
        width: 120,
        height: 120,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },
    title: {
        fontSize: 34,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: '80%',
    },
    // Features List
    listContainer: {
        width: '100%',
        gap: 16,
    },
    featureContainer: {
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    featureBlur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    featureIconBox: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    featureText: {
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
    },
    // Bottom Section
    bottomSection: {
        width: '100%',
        alignItems: 'center', // Center the swipe button
    },
    // Swipe Button Styles
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
    swipeTextContainer: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 20, // Offset text slightly to account for knob start pos
        zIndex: 1,
    },
    swipeText: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    swipeKnob: {
        width: KNOB_WIDTH,
        height: KNOB_WIDTH,
        borderRadius: KNOB_WIDTH / 2,
        position: 'absolute',
        left: 2, // Initial padding
        zIndex: 2,
    },
    knobGradient: {
        flex: 1,
        borderRadius: KNOB_WIDTH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    footerNote: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.8,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 6,
    },
});