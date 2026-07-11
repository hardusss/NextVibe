import React, { useRef } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowDownUp } from 'lucide-react-native';
import { GlassView } from 'expo-glass-effect';
import type { SwapColors } from '@/src/types/swap';

interface SwapFlipButtonProps {
    colors: SwapColors;
    onPress: () => void;
}

export default function SwapFlipButton({ colors, onPress }: SwapFlipButtonProps) {
    const rotateAnim = useRef(new Animated.Value(0)).current;

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.touchable}>
                    <GlassView
                        style={styles.glass}
                        glassEffectStyle="regular"
                        colorScheme={colors.isDark ? 'dark' : 'light'}
                        tintColor={colors.isDark ? 'rgba(168,85,247,0.18)' : 'rgba(124,58,237,0.1)'}
                        isInteractive
                    >
                        <ArrowDownUp
                            size={16}
                            color={colors.accent}
                            strokeWidth={2.2}
                        />
                    </GlassView>
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
    touchable: {
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
    },
    glass: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
