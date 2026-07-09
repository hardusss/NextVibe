import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface from './GlassSurface';

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
    return (
        <GlassSurface
            style={[
                style,
                Platform.OS !== 'ios' && {
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
