import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn as ReanimatedFadeIn } from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type FadeInProps = {
    children: React.ReactNode;
    delay?: number;
    duration?: number;
    from?: 'bottom' | 'top' | 'none';
    style?: StyleProp<ViewStyle>;
};

export default function FadeIn({
    children,
    delay = 0,
    duration = MOTION.duration.normal,
    from = 'bottom',
    style,
}: FadeInProps) {
    const entering =
        from === 'bottom'
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
