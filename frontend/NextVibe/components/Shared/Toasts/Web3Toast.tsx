import { useColorScheme, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, Info, X } from 'lucide-react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type Web3ToastProps = {
    message: string;
    visible: boolean;
    onHide: () => void;
    isSuccess: boolean;
};

export default function Web3Toast({ message, visible, onHide, isSuccess }: Web3ToastProps) {
    const isDark = useColorScheme() === 'dark';
    const translateY = useSharedValue(-100);
    const opacity = useSharedValue(0);
    const progress = useSharedValue(1);

    const finishHide = () => {
        onHide();
    };

    const handleClose = () => {
        translateY.value = withTiming(-100, { duration: MOTION.duration.fast });
        opacity.value = withTiming(0, { duration: MOTION.duration.fast }, (finished) => {
            if (finished) runOnJS(finishHide)();
        });
    };

    useEffect(() => {
        if (visible) {
            progress.value = 1;
            translateY.value = withSpring(0, MOTION.spring.default);
            opacity.value = withTiming(1, { duration: MOTION.duration.fast });
            progress.value = withTiming(0, { duration: 3000 });

            const timer = setTimeout(() => {
                handleClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [visible]);

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
    }));

    const progressStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: progress.value }],
    }));

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.toastContainer,
                containerStyle,
                {
                    backgroundColor: isDark ? 'rgba(15, 8, 25, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                    shadowColor: '#8B5CF6',
                },
            ]}
        >
            <View style={styles.progressContainer}>
                <Animated.View style={[styles.progressTrack, progressStyle]}>
                    <LinearGradient
                        colors={['#8B5CF6', '#6366F1', '#EC4899']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.progressBar}
                    />
                </Animated.View>
            </View>

            <View style={styles.toastContent}>
                <View
                    style={[
                        styles.toastIconContainer,
                        { backgroundColor: isDark ? '#8B5CF620' : '#8B5CF615' },
                    ]}
                >
                    {isSuccess ? (
                        <CheckCircle
                            size={20}
                            color="#A78BFA"
                        />
                    ) : (
                        <Info
                            size={20}
                            color="#A78BFA"
                        />
                    )}
                </View>
                <Text style={[styles.toastText, { color: isDark ? '#F3F4F6' : '#1F2937' }]}>
                    {message}
                </Text>
                <TouchableOpacity
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    onPress={handleClose}
                    style={styles.closeButton}
                    activeOpacity={0.7}
                >
                    <X
                        size={20}
                        color={isDark ? '#9CA3AF' : '#6B7280'}
                    />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        top: 10,
        left: 20,
        right: 20,
        zIndex: 999999999,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    progressContainer: {
        height: 3,
        width: '100%',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        overflow: 'hidden',
    },
    progressTrack: {
        width: '100%',
        height: '100%',
        transformOrigin: 'left',
    },
    progressBar: {
        height: '100%',
        width: '100%',
    },
    toastContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    toastIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    toastText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.2,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
