import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    useColorScheme, 
    StatusBar,
    Dimensions,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    Keyboard,
    TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { 
    FadeInDown, 
    FadeInUp, 
    useSharedValue, 
    withRepeat, 
    withTiming, 
    useAnimatedStyle, 
    withSequence 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Configuration
const MASKED_EMAIL = "an***@gmail.com";
const CODE_LENGTH = 6;
const RESEND_TIMEOUT = 59;

// --- Sub-component: Blinking Cursor ---
// Uses Reanimated for smooth UI-thread animation
const BlinkingCursor = ({ color }: { color: string }) => {
    const opacity = useSharedValue(0);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 400 }), 
                withTiming(0, { duration: 400 })
            ),
            -1, // Infinite loop
            true // Reverse animation
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    return (
        <Animated.View 
            style={[styles.cursor, { backgroundColor: color }, animatedStyle]} 
        />
    );
};

export default function EmailVerificationScreen() {
    // Theme & State
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    
    const [code, setCode] = useState('');
    const [timer, setTimer] = useState(RESEND_TIMEOUT);
    const [isFocused, setIsFocused] = useState(false);
    
    const inputRef = useRef<TextInput>(null);

    // Timer Logic
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Initial Auto-Focus
    useEffect(() => {
        const timeout = setTimeout(() => {
            inputRef.current?.focus();
        }, 500);
        return () => clearTimeout(timeout);
    }, []);

    // Handlers
    const handleCodeChange = (text: string) => {
        const numericValue = text.replace(/[^0-9]/g, '');
        
        if (numericValue.length <= CODE_LENGTH) {
            setCode(numericValue);
            
            // Haptics logic
            if (numericValue.length === CODE_LENGTH) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (numericValue.length > code.length) {
                Haptics.selectionAsync();
            }
        }
    };

    const handleVerify = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        console.log(`Verifying code: ${code}`);
    };

    const handleResend = () => {
        if (timer === 0) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTimer(RESEND_TIMEOUT);
            // logic to resend email
        }
    };

    // Render individual digit box
    const renderCodeDigit = (index: number) => {
        const digit = code[index] || '';
        
        // Logic to determine active state
        const isCurrentDigit = index === code.length;
        const isLastDigit = index === CODE_LENGTH - 1 && code.length === CODE_LENGTH;
        const isActive = (isCurrentDigit || (isLastDigit && isFocused)) && isFocused;
        const isFilled = index < code.length;

        // Dynamic Styles
        const borderColor = isActive 
            ? (isDarkMode ? '#A78BFA' : '#5856D6') 
            : (isFilled 
                ? (isDarkMode ? 'rgba(167, 139, 250, 0.5)' : 'rgba(88, 86, 214, 0.5)') 
                : (isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'));

        const backgroundColor = isDarkMode 
            ? 'rgba(255,255,255,0.05)' 
            : 'rgba(255,255,255,0.3)';

        return (
            <View 
                key={index}
                style={[
                    styles.codeBox, 
                    { backgroundColor, borderColor },
                    isActive && styles.codeBoxActive
                ]}
            >
                {isActive && !isLastDigit ? (
                    <BlinkingCursor color={isDarkMode ? '#A78BFA' : '#5856D6'} />
                ) : (
                    <Text style={[styles.codeText, { color: isDarkMode ? '#FFF' : '#000' }]}>
                        {digit}
                    </Text>
                )}
            </View>
        );
    };

    return (
        <LinearGradient
            colors={isDarkMode ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
            style={styles.container}
        >
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
            
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.contentWrapper}>
                        
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity style={styles.backButton}>
                                <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#000' }]}>
                                Verify Email
                            </Text>
                        </View>

                        <View style={styles.mainSection}>
                            {/* Icon & Description */}
                            <Animated.View entering={FadeInDown.delay(100)} style={{ alignItems: 'center' }}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name="mail-unread-outline" size={32} color={isDarkMode ? '#A78BFA' : '#5856D6'} />
                                </View>
                                <Text style={[styles.title, { color: isDarkMode ? '#FFF' : '#000' }]}>
                                    Enter Code
                                </Text>
                                <Text style={styles.subtitle}>
                                    We have sent a 6-digit code to{"\n"}
                                    <Text style={styles.emailHighlight}>{MASKED_EMAIL}</Text>
                                </Text>
                            </Animated.View>

                            {/* OTP Input Section */}
                            <Animated.View entering={FadeInDown.delay(200)} style={styles.inputWrapper}>
                                {/* Invisible Native Input for handling Focus/Paste/Keyboard */}
                                <TextInput
                                    ref={inputRef}
                                    value={code}
                                    onChangeText={handleCodeChange}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    maxLength={CODE_LENGTH}
                                    keyboardType="number-pad"
                                    textContentType="oneTimeCode"
                                    autoComplete="sms-otp"
                                    style={styles.hiddenInputOverlay}
                                    caretHidden={true}
                                />
                                
                                {/* Visual Representation */}
                                <View style={styles.codeVisualsContainer} pointerEvents="none">
                                    {[...Array(CODE_LENGTH)].map((_, index) => renderCodeDigit(index))}
                                </View>
                            </Animated.View>

                            {/* Wallet Recovery Warning */}
                            <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.infoCard}>
                                <BlurView intensity={20} style={styles.infoCardBlur}>
                                    <Ionicons name="alert-circle" size={24} color={isDarkMode ? '#FCD34D' : '#D97706'} />
                                    <View style={styles.infoTextContainer}>
                                        <Text style={styles.infoTitle}>Important</Text>
                                        <Text style={styles.infoText}>
                                            This email will be linked to your wallet and used for recovery in the future.
                                        </Text>
                                    </View>
                                </BlurView>
                            </Animated.View>
                        </View>

                        {/* Footer Actions */}
                        <Animated.View entering={FadeInUp.delay(400)} style={styles.bottomSection}>
                            <TouchableOpacity
                                style={styles.verifyButton}
                                onPress={handleVerify}
                                disabled={code.length !== CODE_LENGTH}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={code.length === CODE_LENGTH 
                                        ? (isDarkMode ? ['#A78BFA', '#7C3AED'] : ['#5856D6', '#7C3AED'])
                                        : (isDarkMode ? ['#333', '#444'] : ['#CCC', '#DDD'])}
                                    style={styles.verifyButtonGradient}
                                >
                                    <Text style={styles.verifyButtonText}>Verify</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                onPress={handleResend}
                                disabled={timer > 0}
                                style={styles.resendButton}
                            >
                                <Text style={[
                                    styles.resendText,
                                    timer > 0 && styles.resendTimer
                                ]}>
                                    {timer > 0 
                                        ? `Resend code in ${timer}s` 
                                        : "Resend Code"}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    contentWrapper: {
        flex: 1,
        paddingHorizontal: SCREEN_WIDTH * 0.06,
        paddingTop: Platform.OS === 'ios' ? 60 : 50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 30,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginLeft: 15,
    },
    mainSection: {
        flex: 1,
        alignItems: 'center',
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.3)',
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 24,
        color: 'rgba(255,255,255,0.6)',
    },
    emailHighlight: {
        fontWeight: '700',
        color: '#A78BFA',
    },
    
    // --- Input Styles ---
    inputWrapper: {
        width: '100%',
        height: 70,
        marginBottom: 30,
        justifyContent: 'center',
    },
    hiddenInputOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0,
        zIndex: 10,
    },
    codeVisualsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    codeBox: {
        width: (SCREEN_WIDTH - 60) / 7,
        height: (SCREEN_WIDTH - 60) / 7 * 1.2,
        borderRadius: 12,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: "hidden",
    },
    codeBoxActive: {
        
        elevation: 10,
    },
    codeText: {
        fontSize: 24,
        fontWeight: '700',
    },
    cursor: {
        width: 2,
        height: 24,
        borderRadius: 1,
    },
    
    // --- Info Card ---
    infoCard: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    infoCardBlur: {
        padding: 16,
        flexDirection: 'row',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    infoTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FCD34D',
        marginBottom: 4,
    },
    infoText: {
        fontSize: 13,
        lineHeight: 18,
        color: 'rgba(255,255,255,0.8)',
    },

    // --- Bottom Section ---
    bottomSection: {
        width: '100%',
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    verifyButton: {
        height: 56,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    verifyButtonGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    verifyButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
    },
    resendButton: {
        alignItems: 'center',
        padding: 10,
    },
    resendText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#A78BFA',
    },
    resendTimer: {
        color: 'rgba(255,255,255,0.5)',
    },
});