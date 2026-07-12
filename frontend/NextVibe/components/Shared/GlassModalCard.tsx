import React from 'react';
import { Platform, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import LiquidGlassView from './LiquidGlassView';
import { useLiquidGlassEnabled } from '@/src/stores/settingsStore';

interface GlassModalCardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

const SOLID_CARD_STYLE = {
    backgroundColor: '#150d24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
} as const;

/**
 * Modal card using native iOS UIVisualEffectView liquid glass via expo-glass-effect.
 * Content must be rendered as children of GlassView — do not stack fake borders/scrims on top.
 */
export function GlassModalCard({ children, style }: GlassModalCardProps) {
    const liquidGlassEnabled = useLiquidGlassEnabled();
    const useNativeGlass = liquidGlassEnabled && Platform.OS === 'ios';

    if (useNativeGlass) {
        return (
            <LiquidGlassView
                style={[styles.shell, style]}
                glassEffectStyle="regular"
                colorScheme="dark"
                isInteractive
                fallbackBackgroundColor={SOLID_CARD_STYLE.backgroundColor}
            >
                {children}
            </LiquidGlassView>
        );
    }

    return (
        <View style={[styles.shell, style, SOLID_CARD_STYLE]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    shell: {
        overflow: 'hidden',
        borderRadius: 24,
        backgroundColor: 'transparent',
    },
});

export default GlassModalCard;
