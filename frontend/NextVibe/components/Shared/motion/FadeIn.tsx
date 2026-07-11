import React from 'react';
import { StyleProp, ViewStyle, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn as ReanimatedFadeIn, Keyframe } from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type FadeInProps = {
    children: React.ReactNode;
    delay?: number;
    duration?: number;
    from?: 'bottom' | 'top' | 'none';
    style?: StyleProp<ViewStyle>;
};

const iosEnteringBottom = (delay: number, duration: number) => new Keyframe({
    from: {
        transform: [{ translateY: 30 }],
    },
    to: {
        transform: [{ translateY: 0 }],
    },
}).duration(duration).delay(delay);

const iosEnteringTop = (delay: number, duration: number) => new Keyframe({
    from: {
        transform: [{ translateY: -30 }],
    },
    to: {
        transform: [{ translateY: 0 }],
    },
}).duration(duration).delay(delay);

export default function FadeIn({
    children,
    delay = 0,
    duration = MOTION.duration.normal,
    from = 'bottom',
    style,
}: FadeInProps) {
    const entering =
        Platform.OS === 'ios'
            ? from === 'bottom'
                ? iosEnteringBottom(delay, duration)
                : from === 'top'
                ? iosEnteringTop(delay, duration)
                : undefined
            : from === 'bottom'
            ? FadeInDown.duration(duration).delay(delay).springify().damping(18)
            : from === 'top'
            ? FadeInUp.duration(duration).delay(delay).springify().damping(18)
            : ReanimatedFadeIn.duration(duration).delay(delay);

    return (
        <Animated.View entering={entering} style={style}>
            {children}
        </Animated.View>
    );
}
