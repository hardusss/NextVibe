import { Text, View, TextInput, TouchableOpacity, Image, Linking, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import registerDarkStyles from '../../styles/dark-theme/registerStyles';
import registerLightStyles from '@/styles/light-theme/registerStyles';
import React, { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Checkbox } from 'react-native-paper';
import ButtonRegister from './button';
import zxcvbn from 'zxcvbn';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import { useColorScheme } from 'react-native';
import { useRouter } from "expo-router";
import GoogleButtonAuth from '../oauth-components/GoogleButton';

export default function RegisterView() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const registerStyles = colorScheme == "dark" ? registerDarkStyles : registerLightStyles;
    const [hidePassword, setHidePassword] = useState(true);
    const [passwordIcon, setPasswordIcon] = useState('visibility');
    const [checked, setChecked] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [strength, setStrength] = useState('');
    const colorStrength: { [key: string]: string } = {
        'Very Weak': 'red',
        'Weak': 'orange',
        'Good': 'yellow',
        'Strong': 'green',
        'Very Strong': 'lightgreen',
    };

    const handlePasswordChange = (text: string) => {
        setPassword(text);
        const result = zxcvbn(text);
        const strengthLevels = ['Very Weak', 'Weak', 'Good', 'Strong', 'Very Strong'];
        setStrength(strengthLevels[result.score]);
    };

    const togglePasswordVisibility = () => {
        setHidePassword(!hidePassword);
        setPasswordIcon(hidePassword ? 'visibility' : 'visibility-off');
    };

    const handleOpenPrivacyPolicy = () => {
        Linking.openURL('https://www.google.com');
    };

    return (
        <SafeAreaView style={registerStyles.container}>
            <View style={{ position: 'absolute', top: 0, justifyContent: 'center', width: '110%', zIndex: 9999 }}>
                <Toast config={toastConfig} />
            </View>
            <StatusBar
                animated={true}
                backgroundColor={colorScheme === 'dark' ? 'black' : '#f0f0f0'}
            />

            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} >
                <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: 20, }}>
                    <Text style={registerStyles.title}>Register to NextVibe</Text>
                    <Image source={require('../../assets/logo.png')} style={registerStyles.logo} />
                </View>

                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="person" size={20} color="rgb(3, 113, 102)" style={{ marginRight: 10, paddingBottom: 10 }} />
                        <Text style={registerStyles.inputLabel}>Username</Text>
                    </View>
                    <TextInput
                        placeholder="Enter your username"
                        style={registerStyles.input}
                        placeholderTextColor={colorScheme === 'dark' ? '#fff' : '#000'}
                        value={username}
                        onChangeText={setUsername}
                    />
                </View>

                <View style={{ marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="email" size={20} color="rgb(3, 113, 102)" style={{ marginRight: 10, paddingBottom: 10 }} />
                        <Text style={registerStyles.inputLabel}>Email</Text>
                    </View>
                    <TextInput
                        placeholder="Enter your email"
                        style={registerStyles.input}
                        placeholderTextColor={colorScheme === 'dark' ? '#fff' : '#000'}
                        value={email}
                        onChangeText={setEmail}
                    />
                </View>

                <View style={{ marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="password" size={20} color="rgb(3, 113, 102)" style={{ marginRight: 10, paddingBottom: 10 }} />
                        <Text style={registerStyles.inputLabel}>Password</Text>
                    </View>
                    <View>
                        <TextInput
                            placeholder="Enter your password"
                            style={registerStyles.input}
                            placeholderTextColor={colorScheme === 'dark' ? '#fff' : '#000'}
                            secureTextEntry={hidePassword}
                            value={password}
                            onChangeText={handlePasswordChange}
                        />
                        <TouchableOpacity style={registerStyles.passwordIcon} onPress={togglePasswordVisibility}>
                            <MaterialIcons
                                name={passwordIcon as keyof typeof MaterialIcons.glyphMap}
                                size={24}
                                color={colorScheme === 'dark' ? '#fff' : '#000'}
                            />
                        </TouchableOpacity>
                    </View>
                    {password !== '' ? (
                        <Text style={{ color: colorStrength[strength], marginTop: 10 }}>Password Strength: {strength}</Text>
                    ) : null}
                </View>

                <View style={registerStyles.privacyPolicy}>
                    <Checkbox
                        status={checked ? 'checked' : 'unchecked'}
                        onPress={() => {
                            setChecked(!checked);
                        }}
                        color="#58a6ff"
                        
                    />
                    <Text style={{ color: colorScheme === 'dark' ? '#fff' : '#000' }}>
                        I agree to the{' '}
                        <Text style={registerStyles.privacyPolicyText} onPress={handleOpenPrivacyPolicy}>
                            Privacy Policy
                        </Text>
                    </Text>
                </View>

                <ButtonRegister username={username} email={email} password={password} strength={strength} privacy={checked} />

                <View style={registerStyles.hrcontainer}>
                    <View style={registerStyles.line} />
                    <Text style={registerStyles.hrtext}>OR</Text>
                    <View style={registerStyles.line} />
                </View>

                <GoogleButtonAuth page='register' />
                <View>
                    <Text style={registerStyles.bottomText}>
                        Already have an account? <Text style={registerStyles.bottomLink} onPress={() => router.push("/login")}>Login</Text>
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

