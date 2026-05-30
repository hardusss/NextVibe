import React, { useEffect } from 'react';
import { StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { MOTION } from '@/constants/motion';

type AnimatedBalanceProps = {
    isHidden: boolean;
    hiddenContent: React.ReactNode;
    visibleContent: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

export default function AnimatedBalance({
    isHidden,
    hiddenContent,
    visibleContent,
    style,
}: AnimatedBalanceProps) {
    const opacity = useSharedValue(1);

    useEffect(() => {
        opacity.value = withTiming(0, { duration: MOTION.duration.fast / 2 }, (finished) => {
            if (finished) {
                opacity.value = withTiming(1, { duration: MOTION.duration.fast });
            }
        });
    }, [isHidden, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[style, animatedStyle]}>
            {isHidden ? hiddenContent : visibleContent}
        </Animated.View>
    );
}
