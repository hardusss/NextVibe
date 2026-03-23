import React, { useRef } from 'react';
import { Animated, View, StyleSheet, Vibration, TouchableOpacity, Easing } from 'react-native';
import { ArrowDownUp } from 'lucide-react-native';
import type { SwapColors } from '@/src/types/swap';

interface SwapFlipButtonProps {
    colors: SwapColors;
    onPress: () => void;
}

/**
 * Mid-screen button to invert the selected token pair.
 * Shadows removed to maintain visual integrity over translucent layers.
 */
export default function SwapFlipButton({ colors, onPress }: SwapFlipButtonProps) {
    const rotateAnim = useRef(new Animated.Value(0)).current;

    const handlePress = () => {
        Vibration.vibrate(25);
        Animated.sequence([
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 280,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
                toValue: 0,
                duration: 0,
                useNativeDriver: true,
            }),
        ]).start();
        onPress();
    };

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    return (
        <View style={styles.wrap}>
            <Animated.View style={{ transform: [{ rotate }] }}>
                <TouchableOpacity
                    onPress={handlePress}
                    style={[
                        styles.btn,
                        {
                            backgroundColor: colors.isDark
                                ? 'rgba(168,85,247,0.18)'
                                : 'rgba(124,58,237,0.1)',
                            borderColor: colors.chipBorder,
                        },
                    ]}
                >
                    <ArrowDownUp 
                        size={16} 
                        color={colors.accent} 
                        strokeWidth={2.2} 
                    />
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignSelf: 'center',
        zIndex: 10,
        marginVertical: -14,
    },
    btn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});