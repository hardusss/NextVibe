import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Text, Pressable, Image } from 'react-native';
import registerStyles from '../../styles/dark-theme/registerStyles';
import { useEffect } from 'react';
import GoogleRegister from '../../src/api/google.registation';
import GoogleLogin from '@/src/api/google.login';
import { useRouter } from 'expo-router';
import Toast from "react-native-toast-message";

export default function GoogleButtonAuth({ page }: { page: string }) {
    const router = useRouter();

    useEffect(() => {
        GoogleSignin.configure({
           webClientId: '1063264156706-aj2sm2vuqr5ajltpqi6t1k5g82js5jen.apps.googleusercontent.com'
        });
    }, []);

    const signInWithGoogle = async () => {
        try {
            const userInfo = await GoogleSignin.signIn();
            console.log(userInfo);
            const userData = userInfo.data?.user;
            if (userInfo.type === "success" && page === "register") {
                GoogleRegister(`${userData?.givenName}${userData?.familyName}`, `${userData?.email}`, `${userData?.photo}`, router);
            }
            if (userInfo.type === "success" && page === "login") {
                GoogleLogin(`${userData?.email}`, router);
            }
        } catch (error: any) {
            console.log(error.code)
            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                Toast.show({
                    type: 'info',
                    text1: 'Sign-in Cancelled',
                    text2: 'Sign-in was cancelled by the user.',
                });
            } else if (error.code === statusCodes.IN_PROGRESS) {
                Toast.show({
                    type: 'info',
                    text1: 'Sign-in In Progress',
                    text2: 'Sign-in is already in progress.',
                });
            } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                Toast.show({
                    type: 'error',
                    text1: 'Play Services Error',
                    text2: 'Google Play Services are not available or outdated.',
                });
            } else {
                
                Toast.show({
                    type: 'error',
                    text1: 'Sign-in Error',
                    text2: error.message || 'An unexpected error occurred.',
                });
            }
        }
    };

    return (
        <Pressable onPress={signInWithGoogle} style={registerStyles.googlebutton}>
            <Image source={require('../../assets/google.png') } style={registerStyles.icon} />
            <Text style={registerStyles.googletext}>Sign in with Google</Text>
        </Pressable>
    );
}
