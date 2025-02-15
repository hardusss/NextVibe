import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Text, Pressable, Image } from 'react-native';
import registerStyles from '../../styles/dark-theme/registerStyles';
import { useEffect } from 'react';
import GoogleRegister from '../../src/api/google.registation';
import GoogleLogin from '@/src/api/google.login';


export default function GoogleButtonAuth({page}: {page: string}) {
    useEffect(() => {
        GoogleSignin.configure({
            webClientId: '917502296605-mjvinqqafhbnv4ucopebd9ek8mnd1nom.apps.googleusercontent.com', 
        });
    }, []);

    const signInWithGoogle = async () => {
        try {
            const userInfo = await GoogleSignin.signIn();
            const userData = userInfo.data?.user
            if (userInfo.type === "success" && page === "register"){
                GoogleRegister(`${userData?.givenName}${userData?.familyName}`, `${userData?.email}`, `${userData?.photo}`)
            } 
            if (userInfo.type === "success" && page === "login"){
                GoogleLogin(`${userData?.email}`)
            }
        } catch (error: any) {
            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                console.log('Sign-in was cancelled by the user.');
            } else if (error.code === statusCodes.IN_PROGRESS) {
                console.log('Sign-in is already in progress.');
            } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                console.log('Google Play Services are not available or outdated.');
            } 
        }
    };
    return (
        <Pressable onPress={signInWithGoogle} style={registerStyles.googlebutton}>
            <Image
                    source={ require('../../assets/google.png')}
                        style={registerStyles.icon}
                    />
            <Text style={registerStyles.googletext}>Sign in with Google</Text>
        </Pressable>
    );
}

