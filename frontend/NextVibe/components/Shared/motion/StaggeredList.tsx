import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type StaggeredListProps = {
    children: React.ReactNode;
    baseDelay?: number;
    style?: StyleProp<ViewStyle>;
};

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
    return (
        <Animated.View
            entering={FadeInDown.delay(baseDelay + index * MOTION.stagger.listStep)
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
