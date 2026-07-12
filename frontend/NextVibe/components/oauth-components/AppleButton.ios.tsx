import React, { useState, useRef, useCallback } from 'react';
import {
    Pressable,
    StyleSheet,
    ActivityIndicator,
    View,
    Animated,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import LiquidGlassView from '@/components/Shared/LiquidGlassView';
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

/**
 * The real Apple logo silhouette (not the fruit emoji) rendered as vector
 * paths, so it stays crisp at any size and matches Apple's HIG artwork.
 */
function AppleLogo({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return (
        <Svg width={size} height={size * 1.22} viewBox="0 0 384 512">
            <Path
                fill={color}
                d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 8 184.8 8 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-65.7-90-65.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
            />
        </Svg>
    );
}

export default function AppleButtonAuth({ page, onSuccess, onError }: AppleButtonAuthProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<PendingApple | null>(null);
    const scale = useRef(new Animated.Value(1)).current;

    const animateTo = (value: number) => {
        Animated.spring(scale, {
            toValue: value,
            useNativeDriver: true,
            speed: 40,
            bounciness: 6,
        }).start();
    };

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

    return (
        <>
            <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
                <Pressable
                    onPress={signInWithApple}
                    onPressIn={() => animateTo(0.96)}
                    onPressOut={() => animateTo(1)}
                    disabled={loading}
                    style={({ pressed }) => [
                        styles.button,
                        { opacity: pressed ? 0.88 : 1 },
                    ]}
                >
                    <LiquidGlassView
                        style={StyleSheet.absoluteFill}
                        glassEffectStyle="regular"
                        colorScheme="dark"
                        isInteractive
                        fallbackBackgroundColor="#170F24"
                    />
                    {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <View style={styles.content}>
                            <AppleLogo size={20} color="#FFFFFF" />
                        </View>
                    )}
                </Pressable>
            </Animated.View>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 3,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});