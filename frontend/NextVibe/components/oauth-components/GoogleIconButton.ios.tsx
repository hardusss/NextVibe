/**
 * Minimalistic Google icon-only button for iOS registration/login.
 * Shows just the Google icon on a grey background.
 */
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { TouchableOpacity, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import GoogleSignIn from '@/src/api/google.sign.in';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from './InviteCodeSheet';
import { Ionicons } from '@expo/vector-icons';

function usernameFromEmail(email: string): string {
    return email
        .split('@')[0]
        .toLowerCase()
        .replace(/[-+]/g, '_')
        .replace(/[^a-z0-9._]/g, '')
        .replace(/_{2,}/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/^[_.]+|[_.]+$/g, '');
}

interface PendingGoogle {
    username: string;
    email: string;
    photo: string;
    idToken: string;
}

export default function GoogleIconButton({ page }: { page: string }) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const [loading, setLoading] = useState(false);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<PendingGoogle | null>(null);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
            offlineAccess: true,
        });
    }, []);

    const signInWithGoogle = async () => {
        if (loading) return;
        setLoading(true);
        try {
            await GoogleSignin.signOut();
            const userInfo = await GoogleSignin.signIn();
            const userData = userInfo.data?.user;
            const idToken = userInfo.data?.idToken as string;

            const username = usernameFromEmail(userData?.email as string);
            const email = userData?.email as string;
            const photo = userData?.photo ?? 'https://media.nextvibe.io/images/default.png';

            await GoogleSignIn(username, email, photo, router, idToken);
        } catch (error: any) {
            if (error?.response?.data?.error === 'invite_code_required') {
                const userData = (await GoogleSignin.getCurrentUser())?.user;
                pendingRef.current = {
                    username: usernameFromEmail(userData?.email ?? ''),
                    email: userData?.email ?? '',
                    photo: userData?.photo ?? 'https://media.nextvibe.io/images/default.png',
                    idToken: error?.config?.data
                        ? JSON.parse(error.config.data)?.idToken ?? ''
                        : '',
                };
                sheetRef.current?.present();
                setLoading(false);
                return;
            }
            handleGoogleError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleInviteSubmit = useCallback(async (inviteCode: string) => {
        const pending = pendingRef.current;
        if (!pending) return;

        await GoogleSignIn(
            pending.username,
            pending.email,
            pending.photo,
            router,
            pending.idToken,
            inviteCode,
        );

        pendingRef.current = null;
        sheetRef.current?.dismiss();
    }, [router]);

    const handleGoogleError = (error: any) => {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            // Silently ignore
        } else if (error.code === statusCodes.IN_PROGRESS) {
            Toast.show({ type: 'info', text1: 'Sign-in In Progress' });
        } else {
            Toast.show({ type: 'error', text1: 'Sign-in Error', text2: error.message || 'An unexpected error occurred.' });
        }
    };

    const bg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const iconColor = isDark ? '#ffffff' : '#1a1a1a';

    return (
        <>
            <TouchableOpacity
                onPress={signInWithGoogle}
                activeOpacity={0.7}
                style={[styles.button, { backgroundColor: bg }]}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={iconColor} />
                ) : (
                    <Ionicons name="logo-google" size={22} color={iconColor} />
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
