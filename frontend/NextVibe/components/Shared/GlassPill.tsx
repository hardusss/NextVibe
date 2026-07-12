import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface from './GlassSurface';
import { useLiquidGlassEnabled } from '@/src/stores/settingsStore';

interface GlassPillProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    colorScheme?: 'dark' | 'light';
    tintColor?: string;
    fallbackBackgroundColor?: string;
    fallbackBorderColor?: string;
    isInteractive?: boolean;
}

export function GlassPill({
    children,
    style,
    colorScheme = 'dark',
    tintColor,
    fallbackBackgroundColor = 'rgba(0,0,0,0.6)',
    fallbackBorderColor,
    isInteractive,
}: GlassPillProps) {
    const liquidGlassEnabled = useLiquidGlassEnabled();
    const useFallbackStyle = Platform.OS !== 'ios' || !liquidGlassEnabled;

    return (
        <GlassSurface
            style={[
                style,
                useFallbackStyle && {
                    backgroundColor: fallbackBackgroundColor,
                    ...(fallbackBorderColor ? { borderColor: fallbackBorderColor, borderWidth: 1 } : null),
                },
            ]}
            glassEffectStyle="regular"
            colorScheme={colorScheme}
            tintColor={tintColor}
            isInteractive={isInteractive}
            fallbackBackgroundColor={fallbackBackgroundColor}
        >
            {children}
        </GlassSurface>
    );
}

export default GlassPill;
