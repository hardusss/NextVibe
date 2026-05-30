export const MOTION = {
    duration: {
        fast: 200,
        normal: 320,
        slow: 500,
    },
    stagger: {
        step: 60,
        listStep: 80,
    },
    spring: {
        default: { damping: 18, stiffness: 220, mass: 0.8 },
        soft: { damping: 22, stiffness: 180, mass: 0.9 },
        snappy: { damping: 14, stiffness: 280, mass: 0.7 },
    },
    press: {
        scale: 0.97,
    },
} as const;
