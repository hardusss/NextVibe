import React from 'react';
import { Platform, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

interface GlassModalCardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * Modal card using native iOS UIVisualEffectView liquid glass via expo-glass-effect.
 * Content must be rendered as children of GlassView — do not stack fake borders/scrims on top.
 */
export function GlassModalCard({ children, style }: GlassModalCardProps) {
    const useNativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

    if (useNativeGlass) {
        return (
            <GlassView
                style={[styles.shell, style]}
                glassEffectStyle="regular"
                colorScheme="dark"
                isInteractive
            >
                {children}
            </GlassView>
        );
    }

    if (Platform.OS === 'android') {
        return (
            <View style={[styles.shell, style, { backgroundColor: '#150d24', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
                {children}
            </View>
        );
    }

    return (
        <View style={[styles.shell, style]}>
            <BlurView
                intensity={60}
                tint="dark"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFillObject}
            />
            <View style={[StyleSheet.absoluteFillObject, styles.androidScrim]} pointerEvents="none" />
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
    androidScrim: {
        backgroundColor: 'rgba(10,10,10,0.5)',
    },
});

export default GlassModalCard;

