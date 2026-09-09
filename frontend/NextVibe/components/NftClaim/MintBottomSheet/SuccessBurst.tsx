import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Easing,
    type SharedValue,
} from 'react-native-reanimated';

const PARTICLE_COUNT = 14;

interface SuccessBurstProps {
    /** Flips to true once to fire the burst. */
    trigger: boolean;
    color: string;
}

const Particle = ({ progress, index, color }: {
    progress: SharedValue<number>;
    index: number;
    color: string;
}) => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
    const distance = 60 + (index % 3) * 15;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    const style = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 0]),
        transform: [
            { translateX: progress.value * dx },
            { translateY: progress.value * dy },
            { scale: interpolate(progress.value, [0, 1], [1, 0.2]) },
        ],
    }));

    return <Reanimated.View style={[styles.particle, { backgroundColor: color }, style]} />;
};

/** A short radial burst of accent particles from the center — pure Reanimated. */
const SuccessBurst = ({ trigger, color }: SuccessBurstProps) => {
    const progress = useSharedValue(0);

    useEffect(() => {
        if (trigger) {
            progress.value = 0;
            progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
        }
    }, [trigger]);

    if (!trigger) return null;

    return (
        <View style={styles.wrap} pointerEvents="none">
            {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
                <Particle key={i} progress={progress} index={i} color={color} />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    particle: {
        position: 'absolute',
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
});

export default SuccessBurst;
