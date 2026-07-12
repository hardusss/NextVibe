import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { useLiquidGlassEnabled } from '@/src/stores/settingsStore';

type FrostedViewProps = BlurViewProps & {
    fallbackBackgroundColor?: string;
};

/**
 * Blur-based frosted glass surface. On iOS, respects the global Liquid Glass setting
 * by falling back to a solid background when disabled.
 */
export function FrostedView({
    style,
    fallbackBackgroundColor,
    children,
    ...blurProps
}: FrostedViewProps) {
    const liquidGlassEnabled = useLiquidGlassEnabled();

    if (Platform.OS === 'ios' && !liquidGlassEnabled) {
        return (
            <View
                style={[
                    style,
                    fallbackBackgroundColor ? { backgroundColor: fallbackBackgroundColor } : null,
                ]}
            >
                {children}
            </View>
        );
    }

    return (
        <BlurView style={style} {...blurProps}>
            {children}
        </BlurView>
    );
}

export default FrostedView;
