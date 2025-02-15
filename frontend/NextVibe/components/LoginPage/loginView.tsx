import React, { useState } from 'react';
import { 
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Image,
    SafeAreaView,
    StatusBar
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import loginDarkStyles from '../../styles/dark-theme/loginStyles';
import loginLightStyles from '@/styles/light-theme/loginStyles';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import Login from '../../src/api/login';
import { useRouter } from "expo-router";
import { useColorScheme } from 'react-native';
import GoogleButtonAuth from '../oauth-components/GoogleButton';


export default function LoginView() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const loginStyes = colorScheme == "dark" ? loginDarkStyles : loginLightStyles;
    const [hidePassword, setHidePassword] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const togglePasswordVisibility = () => {
        setHidePassword(!hidePassword);
    };

    return (
        <SafeAreaView style={loginStyes.container}>
            <View style={{ position: 'absolute', top: 0, justifyContent: 'center', width: '110%', zIndex: 9999 }}>
                <Toast config={toastConfig} />
            </View>
            <StatusBar animated={true} backgroundColor={colorScheme === 'dark' ? '#09080f' : '#f0f0f0'} />
            
            <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                <Text style={loginStyes.title}>Login to NextVibe</Text>
                <Image source={require('../../assets/logo.png')} style={loginStyes.logo} />
            </View>

            <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="email" size={20} color="#58a6ff" style={{ marginRight: 10, paddingBottom: 10 }} />
                    <Text style={loginStyes.inputLabel}>Email</Text>
                </View>
                <TextInput
                    placeholder="Enter your email"
                    style={loginStyes.input}
                    placeholderTextColor={colorScheme === 'dark' ? '#fff' : '#000'}
                    value={email}
                    onChangeText={setEmail}
                />
            </View>

            <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="password" size={20} color="#58a6ff" style={{ marginRight: 10, paddingBottom: 10 }} />
                    <Text style={loginStyes.inputLabel}>Password</Text>
                </View>
                <View>
                    <TextInput
                        placeholder="Enter your password"
                        style={loginStyes.input}
                        placeholderTextColor={colorScheme === 'dark' ? '#fff' : '#000'}
                        secureTextEntry={hidePassword}
                        value={password}
                        onChangeText={setPassword}
                    />
                    <TouchableOpacity style={loginStyes.passwordIcon} onPress={togglePasswordVisibility}>
                        <MaterialIcons
                            name={hidePassword ? 'visibility' : 'visibility-off'}
                            size={24}
                            color={colorScheme === 'dark' ? '#fff' : '#000'}
                        />
                    </TouchableOpacity>
                </View>
            </View>
            
            <TouchableOpacity style={loginStyes.loginButton} onPress={() => {Login(email, password)}}>
                <Text style={loginStyes.loginButtonText}>Login</Text>
            </TouchableOpacity>

            <View style={loginStyes.hrcontainer}>
                <View style={loginStyes.line} />
                <Text style={loginStyes.hrtext}>OR</Text>
                <View style={loginStyes.line} />
            </View>
            <GoogleButtonAuth page='login'/>
            <View>
                <Text style={loginStyes.bottomText}>
                    Don't have an account? <Text style={loginStyes.bottomLink} onPress={() => router.push("/register")}>Register</Text>
                </Text>
            </View>
        </SafeAreaView>
    )
}