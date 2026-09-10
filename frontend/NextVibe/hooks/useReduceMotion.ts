import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached: boolean | null = null;

/**
 * System Reduce Motion setting. Components should skip stagger/shimmer
 * (and keep only brief fades) when this returns true.
 */
export function useReduceMotion(): boolean {
    const [reduceMotion, setReduceMotion] = useState<boolean>(cached ?? false);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            cached = enabled;
            if (mounted) setReduceMotion(enabled);
        }).catch(() => {});
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
            cached = enabled;
            setReduceMotion(enabled);
        });
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);

    return reduceMotion;
}
