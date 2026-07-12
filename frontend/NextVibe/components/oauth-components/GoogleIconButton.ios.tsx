/**
 * Google icon-only button with authentic Google logo (coloured G).
 * Logo is drawn with react-native-svg — no image asset needed.
 * Styled to sit alongside AppleButtonAuth in the same row on a #0A0410 background.
 */
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Pressable, ActivityIndicator, StyleSheet, View, Animated } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import Svg, { Path } from 'react-native-svg';
import LiquidGlassView from '@/components/Shared/LiquidGlassView';
import GoogleSignIn from '@/src/api/google.sign.in';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from './InviteCodeSheet';

/**
 * Authentic multi-colour Google "G" logo, drawn as vector paths using
 * Google's official brand colours — crisp at any size, no image asset needed.
 */
function GoogleLogo({ size = 20 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
            <Path
                fill="#ffffffff"
                d="M43.6 20.5H42V20.4H24v7.2h11.3c-1.6 4.6-6 7.9-11.3 7.9-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.1-5.1C33.6 6 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
            />
            <Path
                fill="#ffffffff"
                d="M6.3 14.7l5.9 4.3C13.9 15.4 18.6 12.4 24 12.4c3.1 0 5.9 1.2 8 3.1l5.1-5.1C33.6 6.6 29 4.4 24 4.4c-7.6 0-14.2 4.3-17.7 10.3z"
            />
            <Path
                fill="#ffffffff"
                d="M24 44c4.9 0 9.4-1.9 12.8-4.9l-5.9-5c-2 1.5-4.5 2.4-6.9 2.4-5.2 0-9.6-3.3-11.3-7.9l-5.9 4.5C10.1 39.6 16.6 44 24 44z"
            />
            <Path
                fill="#ffffffff"
                d="M43.6 20.5H42V20.4H24v7.2h11.3c-.8 2.2-2.2 4.1-4 5.5l5.9 5c-.4.4 6.8-4.9 6.8-14.7 0-1.2-.1-2.4-.4-3.5z"
            />
        </Svg>
    );
}

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
    const [loading, setLoading] = useState(false);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<PendingGoogle | null>(null);
    const scale = useRef(new Animated.Value(1)).current;

    const animateTo = (value: number) => {
        Animated.spring(scale, {
            toValue: value,
            useNativeDriver: true,
            speed: 40,
            bounciness: 6,
        }).start();
    };

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
            iosClientId: '1063264156706-9of910einuhchb1pef6g482vu8b91nh4.apps.googleusercontent.com',
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

    return (
        <>
            <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
                <Pressable
                    onPress={signInWithGoogle}
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
                            <GoogleLogo size={20} />
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