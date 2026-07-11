import React, { useState } from 'react';
import { Platform, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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

function makeMoreTransparent(color: string | undefined): string | undefined {
    if (!color || typeof color !== 'string') return color;
    return color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\)/g, (match, r, g, b, a) => {
        const newAlpha = Math.max(0, parseFloat(a) * 0.4);
        return `rgba(${r}, ${g}, ${b}, ${newAlpha.toFixed(3)})`;
    });
}

/**
 * iOS liquid glass surface. On Android renders a plain View with an optional fallback background.
 */
export function GlassSurface({
    children,
    style,
    glassEffectStyle = 'clear',
    colorScheme = 'auto',
    tintColor,
    isInteractive,
    fallbackBackgroundColor,
}: GlassSurfaceProps) {
    const [isLayoutDone, setIsLayoutDone] = useState(false);

    if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
        if (!isLayoutDone) {
            return (
                <View
                    style={style}
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout;
                        if (width > 0 && height > 0) {
                            setIsLayoutDone(true);
                        }
                    }}
                >
                    {children}
                </View>
            );
        }

        return (
            <GlassView
                style={style}
                glassEffectStyle={glassEffectStyle}
                colorScheme={colorScheme}
                tintColor={makeMoreTransparent(tintColor)}
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
