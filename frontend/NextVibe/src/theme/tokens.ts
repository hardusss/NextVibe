/**
 * Design tokens — the single source of truth for spacing, radii, type
 * scale, and the dark palette. New/touched styles should read from here
 * instead of hardcoding values.
 *
 * Spacing rules: screen edges `space.lg`, between cards `space.md`,
 * inside cards `space.lg`, list rows `space.md` vertical.
 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
    display: 32,
    title: 24,
    h2: 20,
    body: 16,
    sub: 14,
    caption: 12,
    mono: 13,
} as const;

export const colors = {
    bg: '#0A0410',
    bg2: '#0a0114',
    surface: '#150826',
    card: '#12091f',
    border: 'rgba(255,255,255,0.08)',
    accent: '#a855f7',
    accentDeep: '#7c3aed',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    text: '#FFFFFF',
    sub: 'rgba(255,255,255,0.64)',
    muted: 'rgba(255,255,255,0.4)',
} as const;

/** Durations/springs — kept in sync with `constants/motion.ts` (MOTION). */
export const motion = {
    fast: 150,
    base: 220,
    slow: 320,
    spring: { damping: 18, stiffness: 180 },
} as const;

/** Minimum hit target for icon buttons / tappable rows. */
export const HIT_TARGET = 44;
