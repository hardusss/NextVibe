import React from 'react';
import { Platform, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface from './GlassSurface';

export type GlassBadgeVariant =
    | 'overlay'
    | 'overlay-nft'
    | 'overlay-event'
    | 'feed'
    | 'feed-nft'
    | 'feed-event'
    | 'grid'
    | 'grid-nft'
    | 'grid-ai'
    | 'grid-event';

type VariantConfig = {
    colorScheme: 'dark' | 'light';
    tintColor?: string;
    fallbackBackgroundColor: string;
    fallbackBorderColor: string;
};

const VARIANTS: Record<GlassBadgeVariant, VariantConfig> = {
    overlay: {
        colorScheme: 'dark',
        fallbackBackgroundColor: 'rgba(0,0,0,0.85)',
        fallbackBorderColor: 'rgba(255,255,255,0.2)',
    },
    'overlay-nft': {
        colorScheme: 'dark',
        tintColor: 'rgba(168,85,247,0.25)',
        fallbackBackgroundColor: 'rgba(30,0,50,0.85)',
        fallbackBorderColor: 'rgba(168,85,247,0.6)',
    },
    'overlay-event': {
        colorScheme: 'dark',
        tintColor: 'rgba(168,85,247,0.2)',
        fallbackBackgroundColor: 'rgba(30,0,50,0.85)',
        fallbackBorderColor: 'rgba(168,85,247,0.6)',
    },
    feed: {
        colorScheme: 'dark',
        fallbackBackgroundColor: 'rgba(255,255,255,0.08)',
        fallbackBorderColor: 'rgba(255,255,255,0.12)',
    },
    'feed-nft': {
        colorScheme: 'dark',
        tintColor: 'rgba(168,85,247,0.18)',
        fallbackBackgroundColor: 'rgba(168,85,247,0.15)',
        fallbackBorderColor: 'rgba(168,85,247,0.3)',
    },
    'feed-event': {
        colorScheme: 'dark',
        tintColor: 'rgba(168,85,247,0.15)',
        fallbackBackgroundColor: 'rgba(168,85,247,0.15)',
        fallbackBorderColor: 'rgba(168,85,247,0.4)',
    },
    grid: {
        colorScheme: 'dark',
        fallbackBackgroundColor: 'rgba(0,0,0,0.55)',
        fallbackBorderColor: 'rgba(255,255,255,0.1)',
    },
    'grid-nft': {
        colorScheme: 'dark',
        tintColor: 'rgba(109,40,217,0.35)',
        fallbackBackgroundColor: 'rgba(109,40,217,0.45)',
        fallbackBorderColor: 'rgba(196,181,253,0.25)',
    },
    'grid-ai': {
        colorScheme: 'dark',
        tintColor: 'rgba(5,240,216,0.15)',
        fallbackBackgroundColor: 'rgba(5,240,216,0.15)',
        fallbackBorderColor: 'rgba(5,240,216,0.25)',
    },
    'grid-event': {
        colorScheme: 'dark',
        tintColor: 'rgba(168,85,247,0.2)',
        fallbackBackgroundColor: 'rgba(168,85,247,0.25)',
        fallbackBorderColor: 'rgba(168,85,247,0.4)',
    },
};

interface GlassBadgeProps {
    children: React.ReactNode;
    variant?: GlassBadgeVariant;
    iconOnly?: boolean;
    style?: StyleProp<ViewStyle>;
    /** Override feed badge for light theme */
    feedLight?: boolean;
}

export function GlassBadge({
    children,
    variant = 'overlay',
    iconOnly = false,
    style,
    feedLight = false,
}: GlassBadgeProps) {
    const config = { ...VARIANTS[variant] };

    if (feedLight && variant.startsWith('feed')) {
        config.colorScheme = 'light';
        if (variant === 'feed') {
            config.fallbackBackgroundColor = 'rgba(255,255,255,0.9)';
            config.fallbackBorderColor = 'rgba(124,58,237,0.08)';
        } else if (variant === 'feed-nft') {
            config.fallbackBackgroundColor = 'rgba(168,85,247,0.1)';
            config.fallbackBorderColor = 'rgba(168,85,247,0.3)';
        } else if (variant === 'feed-event') {
            config.fallbackBackgroundColor = 'rgba(168,85,247,0.1)';
            config.fallbackBorderColor = 'rgba(168,85,247,0.3)';
        }
    }

    return (
        <GlassSurface
            style={[
                iconOnly ? styles.iconOnly : styles.badge,
                Platform.OS !== 'ios' && {
                    backgroundColor: config.fallbackBackgroundColor,
                    borderColor: config.fallbackBorderColor,
                },
                style,
            ]}
            glassEffectStyle="regular"
            colorScheme={config.colorScheme}
            tintColor={config.tintColor}
        >
            {children}
        </GlassSurface>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: Platform.OS === 'ios' ? 0 : 1,
        overflow: 'hidden',
    },
    iconOnly: {
        width: 20,
        height: 20,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: Platform.OS === 'ios' ? 0 : 0.5,
        overflow: 'hidden',
    },
});

export default GlassBadge;
