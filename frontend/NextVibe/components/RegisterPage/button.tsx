import { Text, TouchableOpacity, StyleSheet, useColorScheme, Platform, ActivityIndicator } from 'react-native';
import { RegisterButtonProps } from '../../src/types/registerButton';
import Register from '../../src/api/registration';
import { useRouter } from 'expo-router';
import { useState } from 'react';


export default function ButtonRegister(props: RegisterButtonProps) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const ACCENT = isDark ? '#A78BFA' : '#7C3AED';
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await Register(props.username, props.email, props.password, router, props.inviteCode, props.strength, props.privacy);
        } catch (error: any) {
            props.onApiError?.(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.registerButton, { backgroundColor: ACCENT, shadowColor: ACCENT }]}
            onPress={handleRegister}
            disabled={isLoading}
        >
            {isLoading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Text style={styles.registerButtonText}>Create Account</Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    registerButton: {
        borderRadius: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 5,
    },
    registerButtonText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.4,
    },
});
