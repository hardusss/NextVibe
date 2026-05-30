import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type ShimmerSkeletonProps = {
    width?: number | `${number}%`;
    height?: number;
    borderRadius?: number;
    style?: StyleProp<ViewStyle>;
    isDark?: boolean;
};

export default function ShimmerSkeleton({
    width = '100%',
    height = 16,
    borderRadius = 8,
    style,
    isDark = true,
}: ShimmerSkeletonProps) {
    const opacity = useSharedValue(0.45);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.95, { duration: MOTION.duration.slow }),
                withTiming(0.45, { duration: MOTION.duration.slow }),
            ),
            -1,
            false,
        );
    }, [opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const baseColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    return (
        <View style={[{ width, height, borderRadius, overflow: 'hidden' }, style]}>
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: baseColor, borderRadius },
                    animatedStyle,
                ]}
            />
        </View>
    );
}
