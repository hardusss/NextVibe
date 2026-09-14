import { useEffect, useRef, useState } from 'react';
import { useReduceMotion } from './useReduceMotion';

/**
 * Counts 0 → target with an ease-out ramp once `active` flips true.
 * No per-tick haptics — fire a single notification at the call site.
 * Jumps straight to the target under Reduce Motion.
 */
export function useRepCountUp(active: boolean, target: number, duration = 800): number {
    const reduceMotion = useReduceMotion();
    const [value, setValue] = useState(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!active || target <= 0) {
            setValue(0);
            return;
        }
        if (reduceMotion) {
            setValue(target);
            return;
        }
        const start = Date.now();
        const tick = () => {
            const t = Math.min(1, (Date.now() - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(eased * target));
            if (t < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [active, target, reduceMotion, duration]);

    return value;
}
