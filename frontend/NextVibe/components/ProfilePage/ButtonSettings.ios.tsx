import { Animated, TouchableOpacity, useColorScheme, StyleSheet } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Menu } from 'lucide-react-native';
import { GlassSurface } from '@/components/Shared/GlassSurface';

const ButtonSettings = () => {
    const [scale] = useState(new Animated.Value(1));
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
    const router = useRouter();

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.90,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            friction: 3,
            useNativeDriver: true,
        }).start();
        router.push("/settings");
    };

    return (
        <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
            <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                style={styles.touchable}
            >
                <GlassSurface
                    style={styles.glass}
                    glassEffectStyle="regular"
                    colorScheme={isDark ? "dark" : "light"}
                    isInteractive
                    fallbackBackgroundColor={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}
                >
                    <Menu
                        color={isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.8)"}
                        size={20}
                    />
                </GlassSurface>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
    },
    touchable: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    glass: {
        width: 42,
        height: 42,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default ButtonSettings;
