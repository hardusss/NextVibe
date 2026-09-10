import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';
import { useReduceMotion } from '@/hooks/useReduceMotion';

type StaggeredListProps = {
    children: React.ReactNode;
    baseDelay?: number;
    style?: StyleProp<ViewStyle>;
};

// Only the first rows visible on screen stagger; anything below the fold
// appears instantly so long lists don't animate forever.
const MAX_STAGGERED_ROWS = 8;

export function StaggeredItem({
    index,
    baseDelay = 0,
    children,
    style,
}: {
    index: number;
    baseDelay?: number;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const reduceMotion = useReduceMotion();

    if (reduceMotion) {
        return <Animated.View style={style}>{children}</Animated.View>;
    }

    const cappedIndex = Math.min(index, MAX_STAGGERED_ROWS);
    return (
        <Animated.View
            entering={FadeInDown.delay(baseDelay + cappedIndex * MOTION.stagger.listStep)
                .springify()
                .damping(MOTION.spring.default.damping)}
            style={style}
        >
            {children}
        </Animated.View>
    );
}

export default function StaggeredList({ children, style }: StaggeredListProps) {
    return <Animated.View style={style}>{children}</Animated.View>;
}
