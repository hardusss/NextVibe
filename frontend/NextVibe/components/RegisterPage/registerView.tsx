import { 
    Text, 
    View, 
    TextInput, 
    TouchableOpacity, 
    Linking, 
    SafeAreaView, 
    StatusBar, 
    ScrollView, 
    StyleSheet, 
    KeyboardAvoidingView, 
    Platform,
    useColorScheme 
} from 'react-native';
import React, { useState, useEffect } from 'react';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Checkbox } from 'react-native-paper';
import ButtonRegister from './button'; 
import zxcvbn from 'zxcvbn';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import { useRouter } from "expo-router";
import GoogleButtonAuth from '../oauth-components/GoogleButton';
import FastImage from 'react-native-fast-image';
import { BackHandler } from "react-native";

export default function RegisterView() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const ACCENT_COLOR = isDark ? '#A78BFA' : '#7C3AED'; 

    const [hidePassword, setHidePassword] = useState(true);
    const [checked, setChecked] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [strengthScore, setStrengthScore] = useState(0); 
    const [strengthLabel, setStrengthLabel] = useState('');
    const [focusedInput, setFocusedInput] = useState<string | null>(null);

    const { styles, colors } = getModernTheme(isDark, ACCENT_COLOR);

    const handlePasswordChange = (text: string) => {
        setPassword(text);
        const result = zxcvbn(text);
        setStrengthScore(result.score);
        const strengthLevels = ['Too Weak', 'Weak', 'Good', 'Strong', 'Excellent'];
        setStrengthLabel(strengthLevels[result.score]);
    };

    const handleOpenPrivacyPolicy = () => Linking.openURL('https://nextvibe.io');
    const handleOpenTerms = () => Linking.openURL('https://nextvibe.io');

    const getStrengthColor = () => {
        if (password.length === 0) return isDark ? '#333' : '#e0e0e0';
        switch (strengthScore) {
            case 0: return '#ff4d4d'; 
            case 1: return '#ff944d'; 
            case 2: return '#ffda4d'; 
            case 3: return ACCENT_COLOR; // Purple
            case 4: return '#00cc66'; 
            default: return isDark ? '#333' : '#e0e0e0';
        }
    };

    useEffect(() => {
        const handler = BackHandler.addEventListener(
            "hardwareBackPress",
            () => true 
        );

        return () => handler.remove();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ position: 'absolute', zIndex: 9999, width: '100%', alignItems: 'center' }}>
                <Toast config={toastConfig} />
            </View>
            <StatusBar
                animated={true}
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={isDark ? '#0A0410' : '#ffffff'}
            />

            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContent} 
                    keyboardShouldPersistTaps="handled" 
                    showsVerticalScrollIndicator={false}>

                    <View style={styles.headerContainer}>
                        <FastImage 
                            source={require('../../assets/logo.png')} 
                            style={styles.logo} 
                            resizeMode={FastImage.resizeMode.contain}
                        />
                        <Text style={styles.title}>Join NextVibe</Text>
                        <Text style={styles.subtitle}>Create an account to start your journey</Text>
                    </View>

                    <View style={styles.formContainer}>
                        
                        {/* Username Input */}
                        <View style={[styles.inputContainer, focusedInput === 'username' && styles.inputFocused]}>
                            <MaterialIcons 
                                name="person-outline" 
                                size={22} 
                                color={focusedInput === 'username' ? colors.iconActive : colors.iconInactive} 
                                style={styles.inputIcon} 
                            />
                            <TextInput
                                placeholder="Username"
                                style={styles.input}
                                placeholderTextColor={colors.placeholderColor} // ТЕПЕР ЦЕ РЯДОК, А НЕ СТИЛЬ
                                value={username}
                                onChangeText={setUsername}
                                onFocus={() => setFocusedInput('username')}
                                onBlur={() => setFocusedInput(null)}
                            />
                        </View>

                        {/* Email Input */}
                        <View style={[styles.inputContainer, focusedInput === 'email' && styles.inputFocused]}>
                            <MaterialCommunityIcons 
                                name="email-outline" 
                                size={22} 
                                color={focusedInput === 'email' ? colors.iconActive : colors.iconInactive} 
                                style={styles.inputIcon} 
                            />
                            <TextInput
                                placeholder="Email Address"
                                style={styles.input}
                                placeholderTextColor={colors.placeholderColor}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                onFocus={() => setFocusedInput('email')}
                                onBlur={() => setFocusedInput(null)}
                            />
                        </View>

                        {/* Password Input */}
                        <View style={[styles.inputContainer, focusedInput === 'password' && styles.inputFocused]}>
                            <MaterialCommunityIcons 
                                name="lock-outline" 
                                size={22} 
                                color={focusedInput === 'password' ? colors.iconActive : colors.iconInactive} 
                                style={styles.inputIcon} 
                            />
                            <TextInput
                                placeholder="Password"
                                style={styles.input}
                                placeholderTextColor={colors.placeholderColor}
                                secureTextEntry={hidePassword}
                                value={password}
                                onChangeText={handlePasswordChange}
                                onFocus={() => setFocusedInput('password')}
                                onBlur={() => setFocusedInput(null)}
                            />
                            <TouchableOpacity onPress={() => setHidePassword(!hidePassword)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                                <MaterialIcons
                                    name={hidePassword ? 'visibility-off' : 'visibility'}
                                    size={22}
                                    color={colors.iconInactive}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Password Strength Bar */}
                        {password.length > 0 && (
                            <View style={styles.strengthContainer}>
                                <View style={styles.strengthBarContainer}>
                                    {[0, 1, 2, 3].map((level) => (
                                        <View 
                                            key={level} 
                                            style={[
                                                styles.strengthBarItem, 
                                                { backgroundColor: strengthScore > level ? getStrengthColor() : (isDark ? '#333' : '#e0e0e0') }
                                            ]} 
                                        />
                                    ))}
                                </View>
                                <Text style={[styles.strengthText, { color: getStrengthColor() }]}>
                                    {strengthLabel}
                                </Text>
                            </View>
                        )}

                        {/* Terms & Privacy */}
                        <View style={styles.privacyContainer}>
                            <Checkbox.Android
                                status={checked ? 'checked' : 'unchecked'}
                                onPress={() => setChecked(!checked)}
                                color={ACCENT_COLOR}
                                uncheckedColor={colors.iconInactive}
                            />
                            <Text style={styles.privacyText}>
                                I agree to the{' '}
                                <Text style={styles.linkText} onPress={handleOpenPrivacyPolicy}>Privacy Policy</Text>
                                {' '}and{' '}
                                <Text style={styles.linkText} onPress={handleOpenTerms}>Terms of Use</Text>
                            </Text>
                        </View>

                        <View style={{ marginTop: 10 }}>
                            <ButtonRegister 
                                username={username} 
                                email={email} 
                                password={password} 
                                strength={strengthLabel} 
                                privacy={checked} 
                            />
                        </View>

                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <GoogleButtonAuth page='register' />

                        <View style={styles.footerContainer}>
                            <Text style={styles.footerText}>Already have an account?</Text>
                            <TouchableOpacity onPress={() => router.replace("/login")}>
                                <Text style={styles.loginLink}>Login</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getModernTheme = (isDark: boolean, accentColor: string) => {
    const colors = {
        placeholderColor: isDark ? '#666' : '#999',
        iconActive: accentColor,
        iconInactive: isDark ? '#666' : '#999',
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#ffffff',
        },
        scrollContent: {
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 40, // Fixed jumpy keyboard
        },
        headerContainer: {
            alignItems: 'center',
            marginBottom: 32,
            marginTop: 20,
        },
        logo: {
            width: 80,
            height: 80,
            borderRadius: 20,
            marginBottom: 16,
        },
        title: {
            fontSize: 28,
            fontWeight: '700',
            color: isDark ? '#ffffff' : '#1a1a1a',
            marginBottom: 8,
        },
        subtitle: {
            fontSize: 14,
            color: isDark ? '#a0a0a0' : '#666666',
            textAlign: 'center',
        },
        formContainer: {
            width: '100%',
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#1A1625' : '#f5f5f5',
            borderRadius: 16,
            paddingHorizontal: 16,
            height: 56,
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: 'transparent',
        },
        inputFocused: {
            borderColor: accentColor,
            backgroundColor: isDark ? '#1F1B2E' : '#f3e8ff',
        },
        inputIcon: {
            marginRight: 12,
        },
        input: {
            flex: 1,
            height: '100%',
            color: isDark ? '#fff' : '#000',
            fontSize: 16,
        },
        
        // Password Strength
        strengthContainer: {
            marginTop: -8,
            marginBottom: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        strengthBarContainer: {
            flexDirection: 'row',
            flex: 1,
            height: 4,
            borderRadius: 2,
            overflow: 'hidden',
            marginRight: 12,
            gap: 4,
        },
        strengthBarItem: {
            flex: 1,
            height: '100%',
            borderRadius: 2,
        },
        strengthText: {
            fontSize: 12,
            fontWeight: '600',
        },
    
        // Privacy
        privacyContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 24,
        },
        privacyText: {
            fontSize: 13,
            color: isDark ? '#ccc' : '#444',
            flex: 1,
            marginLeft: 4,
            lineHeight: 20,
        },
        linkText: {
            color: accentColor,
            fontWeight: '600',
        },
    
        // Divider
        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: 24,
        },
        dividerLine: {
            flex: 1,
            height: 1,
            backgroundColor: isDark ? '#333' : '#e0e0e0',
        },
        dividerText: {
            paddingHorizontal: 16,
            color: isDark ? '#666' : '#999',
            fontSize: 12,
            fontWeight: '600',
        },
    
        // Footer
        footerContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 24,
        },
        footerText: {
            color: isDark ? '#888' : '#666',
            fontSize: 14,
        },
        loginLink: {
            color: accentColor,
            fontWeight: '700',
            marginLeft: 6,
            fontSize: 14,
        },
    });

    return { styles, colors };
};