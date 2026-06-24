import React, { useState, useRef, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Apple } from 'lucide-react-native';
import AppleSignIn from '@/src/api/apple.sign.in';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from './InviteCodeSheet';

interface PendingApple {
    identityToken: string;
    email: string | null;
    fullName: string | null;
}

interface AppleButtonAuthProps {
    page: string;
    onSuccess?: (response: any) => void;
    onError?: (error: any) => void;
}

export default function AppleButtonAuth({ page, onSuccess, onError }: AppleButtonAuthProps) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const [loading, setLoading] = useState(false);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<PendingApple | null>(null);

    const signInWithApple = async () => {
        if (loading) return;
        setLoading(true);

        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const identityToken = credential.identityToken;
            if (!identityToken) {
                throw new Error('No identity token received from Apple');
            }

            const fullName = credential.fullName
                ? [credential.fullName.givenName, credential.fullName.familyName]
                    .filter(Boolean)
                    .join('_')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '') || null
                : null;

            await AppleSignIn(
                identityToken,
                credential.email,
                fullName,
                router,
            );

            if (onSuccess) onSuccess({});
        } catch (error: any) {
            if (error?.response?.data?.error === 'invite_code_required') {
                // Save pending data and open invite sheet
                pendingRef.current = {
                    identityToken: error?.config?.data
                        ? JSON.parse(error.config.data)?.identityToken ?? ''
                        : '',
                    email: null,
                    fullName: null,
                };
                sheetRef.current?.present();
                setLoading(false);
                return;
            }

            if (error?.code === 'ERR_REQUEST_CANCELED') {
                // User cancelled — don't show error
                setLoading(false);
                return;
            }

            if (onError) onError(error);
            else {
                Toast.show({
                    type: 'error',
                    text1: 'Apple Sign-in Failed',
                    text2: error?.message || 'An unexpected error occurred.',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleInviteSubmit = useCallback(async (inviteCode: string) => {
        const pending = pendingRef.current;
        if (!pending) return;

        await AppleSignIn(
            pending.identityToken,
            pending.email,
            pending.fullName,
            router,
            inviteCode,
        );

        pendingRef.current = null;
        sheetRef.current?.dismiss();
    }, [router]);

    const bg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const iconColor = isDark ? '#ffffff' : '#1a1a1a';

    return (
        <>
            <TouchableOpacity
                onPress={signInWithApple}
                activeOpacity={0.7}
                style={[styles.button, { backgroundColor: bg }]}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={iconColor} />
                ) : (
                    <Apple size={24} color={iconColor} />
                )}
            </TouchableOpacity>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </>
    );
}

const styles = StyleSheet.create({
    button: {
        flex: 1,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
