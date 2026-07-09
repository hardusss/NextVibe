import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect/build/GlassView.types';

type GlassSurfaceProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    glassEffectStyle?: GlassStyle;
    colorScheme?: GlassColorScheme;
    tintColor?: string;
    isInteractive?: boolean;
    /** Used on Android when this component is rendered from shared code. */
    fallbackBackgroundColor?: string;
};

/**
 * iOS liquid glass surface. On Android renders a plain View with an optional fallback background.
 */
export function GlassSurface({
    children,
    style,
    glassEffectStyle = 'regular',
    colorScheme = 'auto',
    tintColor,
    isInteractive,
    fallbackBackgroundColor,
}: GlassSurfaceProps) {
    if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
        return (
            <GlassView
                style={style}
                glassEffectStyle={glassEffectStyle}
                colorScheme={colorScheme}
                tintColor={tintColor}
                isInteractive={isInteractive}
            >
                {children}
            </GlassView>
        );
    }

    return (
        <View style={[style, fallbackBackgroundColor ? { backgroundColor: fallbackBackgroundColor } : null]}>
            {children}
        </View>
    );
}

export default GlassSurface;
