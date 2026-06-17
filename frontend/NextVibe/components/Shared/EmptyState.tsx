import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import LottieView from 'lottie-react-native';

interface EmptyStateProps {
    /** Title text */
    title?: string;
    /** Subtitle description */
    subtitle?: string;
    /** Lottie animation key. Default: 'error' */
    animation?: 'error' | 'code';
    /** Size of the Lottie animation. Default: 180 */
    size?: number;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title = 'Nothing found',
    subtitle = 'Please return later',
    animation = 'error',
    size = 180,
}) => {
    const isDark = useColorScheme() === 'dark';
    const source = animation === 'error'
        ? require('@/assets/lottie/error.json')
        : require('@/assets/lottie/code.json');

    return (
        <View style={styles.container}>
            <LottieView
                source={source}
                autoPlay
                loop
                style={{ width: size, height: size }}
            />
            <Text style={[styles.title, { color: isDark ? '#E3E3E3' : '#333' }]}>
                {title}
            </Text>
            {subtitle ? (
                <Text style={[styles.subtitle, { color: isDark ? '#aaa' : '#666' }]}>
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 17,
        fontFamily: 'Dank Mono Bold',
        marginTop: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        marginTop: 6,
        textAlign: 'center',
    },
});

export default EmptyState;
