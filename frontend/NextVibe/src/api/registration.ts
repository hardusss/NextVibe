import Toast from 'react-native-toast-message';
import axios from 'axios';
import validationInput from '../validation/register-validator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GetApiUrl from '../utils/url_api';


export default async function Register (username: string, email: string, password: string, strength?: string, privacy?: boolean) {
    const validation: boolean = validationInput(username, email, password);
    if (!validation) {
        return;
    }
    const data = {
        username: username,
        email: email,
        password: password
    }


    if (strength === 'Good' || strength === 'Strong' || strength === 'Very Strong') {
        if (!privacy) {
            Toast.show({
                type: 'error',
                text1: 'Privacy policy is required',
                text2: 'Please check the privacy policy'
            });
            return;
        }

        await axios.post(`${GetApiUrl()}/users/register/`, data)
            .then(response => {
                AsyncStorage.setItem("id", `${response.data.user_id}`)
                AsyncStorage.setItem("access", response.data.data.token.access)
                AsyncStorage.setItem("refresh", response.data.data.token.refresh)
                Toast.show({
                    type: 'success',
                    text1: 'Registration successful',
                    text2: 'Welcome to NextVibe'
                });

            })
            .catch(error => {
                console.log(error);
                Toast.show({
                    type: 'error',
                    text1: 'Registration failed',
                    text2: 'Username or email already exists, go login!',
                });
            });
    } else {
        Toast.show({
            type: 'error',
            text1: 'Password is too weak',
            text2: 'Please choose a stronger password'
        });
    }
};


