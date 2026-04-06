import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Text, Pressable, Image, useColorScheme } from 'react-native';
import registerStyles from '../../styles/dark-theme/registerStyles';
import { useEffect, useRef, useCallback } from 'react';
import GoogleSignIn from '@/src/api/google.sign.in';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import InviteCodeSheet from './InviteCodeSheet';

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

/** Pending google data saved when invite code is required */
interface PendingGoogle {
    username: string;
    email: string;
    photo: string;
    idToken: string;
}

export default function GoogleButtonAuth({ page }: { page: string }) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<PendingGoogle | null>(null);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com',
            offlineAccess: true,
        });
    }, []);

    const signInWithGoogle = async () => {
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
                // Save pending data and open invite sheet
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
                return;
            }

            handleGoogleError(error);
        }
    };

    const handleInviteSubmit = useCallback(async (inviteCode: string) => {
        const pending = pendingRef.current;
        if (!pending) return;

        // Pass invite code to the API — extend GoogleSignIn to accept it
        await GoogleSignIn(
            pending.username,
            pending.email,
            pending.photo,
            router,
            pending.idToken,
            inviteCode, // new optional param
        );

        pendingRef.current = null;
        sheetRef.current?.dismiss();
    }, [router]);

    const handleGoogleError = (error: any) => {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            Toast.show({ type: 'info', text1: 'Sign-in Cancelled', text2: 'Sign-in was cancelled by the user.' });
        } else if (error.code === statusCodes.IN_PROGRESS) {
            Toast.show({ type: 'info', text1: 'Sign-in In Progress', text2: 'Sign-in is already in progress.' });
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            Toast.show({ type: 'error', text1: 'Play Services Error', text2: 'Google Play Services are not available or outdated.' });
        } else {
            Toast.show({ type: 'error', text1: 'Sign-in Error', text2: error.message || 'An unexpected error occurred.' });
        }
    };

    return (
        <>
            <Pressable
                onPress={signInWithGoogle}
                style={[
                    registerStyles.googlebutton,
                    { borderWidth: !isDark ? 0.6 : 0, borderColor: !isDark ? '#791cb3ff' : '#fafafa' }
                ]}
            >
                <Image source={require('../../assets/google.png')} style={registerStyles.icon} />
                <Text style={registerStyles.googletext}>Sign in with Google</Text>
            </Pressable>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </>
    );
}