import React from 'react';
import { Platform, StyleSheet, View, useColorScheme, type ColorSchemeName, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import * as ExpoDevice from 'expo-device';
import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect/build/GlassView.types';
import LiquidGlassView from './LiquidGlassView';
import { useLiquidGlassEnabled } from '@/src/stores/settingsStore';

type GlassSurfaceProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    glassEffectStyle?: GlassStyle;
    colorScheme?: GlassColorScheme;
    tintColor?: string;
    isInteractive?: boolean;
    /** Used when liquid glass is unavailable or disabled. */
    fallbackBackgroundColor?: string;
    /**
     * Android: render a real blur (dimezis BlurView) behind the content so
     * headers/tab bars visually match the iOS glass. Low-memory devices
     * (< 4 GB) skip the blur and get the fallback colour instead.
     */
    androidBlur?: boolean;
    androidBlurIntensity?: number;
};

// Blur is costly on weak GPUs — settle it once per session.
const IS_LOW_END_ANDROID =
    Platform.OS === 'android' &&
    (ExpoDevice.totalMemory ?? 0) > 0 &&
    (ExpoDevice.totalMemory as number) < 4 * 1024 * 1024 * 1024;

function resolveIosFallbackBackground(
    colorScheme: GlassColorScheme,
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

    return resolved === 'light' ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.1)';
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
    androidBlur = false,
    androidBlurIntensity = 50,
}: GlassSurfaceProps) {
    const liquidGlassEnabled = useLiquidGlassEnabled();
    const systemScheme = useColorScheme();
    const useNativeGlass =
        liquidGlassEnabled && Platform.OS === 'ios' && isGlassEffectAPIAvailable();

    if (useNativeGlass) {
        return (
            <LiquidGlassView
                style={style}
                glassEffectStyle={glassEffectStyle}
                colorScheme={colorScheme}
                tintColor={tintColor}
                isInteractive={isInteractive}
                fallbackBackgroundColor={fallbackBackgroundColor}
            >
                {children}
            </LiquidGlassView>
        );
    }

    if (Platform.OS === 'ios') {
        return (
            <View
                style={[
                    style,
                    {
                        backgroundColor: resolveIosFallbackBackground(
                            colorScheme,
                            systemScheme,
                            fallbackBackgroundColor,
                        ),
                    },
                ]}
            >
                {children}
            </View>
        );
    }

    // Android
    if (androidBlur && !IS_LOW_END_ANDROID) {
        const resolvedScheme =
            colorScheme === 'light' || colorScheme === 'dark'
                ? colorScheme
                : systemScheme === 'light'
                  ? 'light'
                  : 'dark';
        return (
            <View style={[style, { overflow: 'hidden' }]}>
                <BlurView
                    tint={resolvedScheme}
                    intensity={androidBlurIntensity}
                    experimentalBlurMethod="dimezisBlurView"
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                {children}
            </View>
        );
    }

    return (
        <View style={[style, fallbackBackgroundColor ? { backgroundColor: fallbackBackgroundColor } : null]}>
            {children}
        </View>
    );
}

export default GlassSurface;
