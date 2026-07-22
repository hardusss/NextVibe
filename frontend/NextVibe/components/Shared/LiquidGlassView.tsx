import React from 'react';
import { Platform, View, useColorScheme, type ColorSchemeName, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect/build/GlassView.types';
import { useLiquidGlassEnabled } from '@/src/stores/settingsStore';

type LiquidGlassViewProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    glassEffectStyle?: GlassStyle;
    colorScheme?: GlassColorScheme;
    tintColor?: string;
    isInteractive?: boolean;
    pointerEvents?: 'none' | 'box-none' | 'box-only' | 'auto';
    fallbackBackgroundColor?: string;
};

function resolveFallbackBackground(
    colorScheme: GlassColorScheme | undefined,
    systemScheme: ColorSchemeName | null | undefined,
    override?: string,
): string {
    if (override) return override;

    const resolved =
        colorScheme === 'light' || colorScheme === 'dark'
            ? colorScheme
            : systemScheme === 'light'
              ? 'light'
              : 'dark';

    return resolved === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.1)';
}

function makeMoreTransparent(color: string | undefined): string | undefined {
    if (!color || typeof color !== 'string') return color;
    return color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\)/g, (_match, r, g, b, a) => {
        const newAlpha = Math.max(0, parseFloat(a) * 0.4);
        return `rgba(${r}, ${g}, ${b}, ${newAlpha.toFixed(3)})`;
    });
}

/**
 * Drop-in replacement for GlassView that respects the global Liquid Glass setting.
 * Falls back to a plain View with a solid background when disabled.
 */
export function LiquidGlassView({
    children,
    style,
    glassEffectStyle = 'clear',
    colorScheme = 'auto',
    tintColor,
    isInteractive,
    pointerEvents,
    fallbackBackgroundColor,
}: LiquidGlassViewProps) {
    const liquidGlassEnabled = useLiquidGlassEnabled();
    const systemScheme = useColorScheme();

    const useNativeGlass =
        liquidGlassEnabled && Platform.OS === 'ios' && isGlassEffectAPIAvailable();

    if (useNativeGlass) {
        return (
            <GlassView
                style={style}
                glassEffectStyle={glassEffectStyle}
                colorScheme={colorScheme}
                tintColor={makeMoreTransparent(tintColor)}
                isInteractive={isInteractive}
                pointerEvents={pointerEvents}
            >
                {children}
            </GlassView>
        );
    }

    const backgroundColor = resolveFallbackBackground(colorScheme, systemScheme, fallbackBackgroundColor);

    return (
        <View style={[style, { backgroundColor }]} pointerEvents={pointerEvents}>
            {children}
        </View>
    );
}

export default LiquidGlassView;
