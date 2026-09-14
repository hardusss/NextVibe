import React from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import haptics from '@/src/utils/haptics';
import { MOTION } from '@/constants/motion';
import { space, radius, colors, type as typeScale } from '@/src/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

type EventCtaProps = {
    label: string;
    onPress: () => void;
    variant?: Variant;
    icon?: React.ReactNode;
    disabled?: boolean;
    busy?: boolean;
    accessibilityLabel?: string;
};

/**
 * One CTA vocabulary for the event flow screens: primary is the accent
 * gradient, secondary a bordered surface, ghost a bare text action.
 */
export default function EventCta({
    label,
    onPress,
    variant = 'primary',
    icon,
    disabled = false,
    busy = false,
    accessibilityLabel,
}: EventCtaProps) {
    const isDark = useColorScheme() === 'dark';
    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const handlePress = () => {
        if (disabled || busy) return;
        haptics.impact('light');
        onPress();
    };

    const content = busy ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : colors.accent} />
    ) : (
        <View style={styles.contentWrap}>
            {icon}
            <Text
                style={[
                    styles.label,
                    variant === 'primary' && { color: colors.text },
                    variant === 'secondary' && { color: isDark ? colors.text : '#111827' },
                    variant === 'ghost' && { color: isDark ? colors.sub : 'rgba(17,24,39,0.5)' },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );

    return (
        <Pressable
            onPress={handlePress}
            onPressIn={() => { if (!disabled) scale.value = withSpring(MOTION.press.scale, MOTION.spring.snappy); }}
            onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy); }}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
        >
            <Animated.View style={[animStyle, disabled && { opacity: 0.5 }]}>
                {variant === 'primary' ? (
                    <LinearGradient
                        style={styles.button}
                        colors={[colors.accent, colors.accentDeep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        {content}
                    </LinearGradient>
                ) : (
                    <View
                        style={[
                            styles.button,
                            variant === 'secondary' && {
                                backgroundColor: isDark ? colors.surface : 'rgba(0,0,0,0.04)',
                                borderWidth: 1,
                                borderColor: isDark ? colors.border : 'rgba(0,0,0,0.08)',
                            },
                        ]}
                    >
                        {content}
                    </View>
                )}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        width: '100%',
        height: 52,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: space.lg,
    },
    contentWrap: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: space.sm,
    },
    label: {
        fontFamily: 'Dank Mono Bold',
        fontSize: typeScale.body,
        includeFontPadding: false,
        flexShrink: 1,
    },
});
