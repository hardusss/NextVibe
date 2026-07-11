import React, { useState, useEffect } from 'react';
import {
    Text,
    View,
    TextInput,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
    ActivityIndicator,
    SafeAreaView,
} from 'react-native';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import Login from '../../src/api/login';
import { useRouter } from 'expo-router';
import GoogleButtonAuth from '../oauth-components/GoogleButton';
import GoogleIconButton from '../oauth-components/GoogleIconButton';
import AppleButtonAuth from '../oauth-components/AppleButton';
import { Image } from 'expo-image';
import { BackHandler } from 'react-native';
import ButtonWalletSignIn from '../SignInViaWallet/ButtonWalletSignIn';
import ButtonLazorKitSignIn from '../SignInViaWallet/ButtonLazorKitSignIn';

export default function LoginView() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const ACCENT_COLOR = isDark ? '#A78BFA' : '#7C3AED';

    const [hidePassword, setHidePassword] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const { styles, colors } = getModernTheme(isDark, ACCENT_COLOR);

    useEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => handler.remove();
    }, []);

    const handleLogin = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await Login(email, password, router);
        } catch (e) {
            console.log(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleWalletSuccess = (backendResponse: any) => {
        Toast.show({
            type: 'success',
            text1: 'Connected Successfully',
            text2: 'Welcome to NextVibe!',
        });
        router.replace('/home');
    };

    const handleWalletError = (error: any) => {
        const realError = error?.response?.data?.error || error?.message || 'Unknown error';
        Toast.show({
            type: 'error',
            text1: 'Connection Failed',
            text2: realError,
        });
    };

    // Отримуємо колір фону для кореневого елемента
    const rootBackgroundColor = isDark ? '#0A0410' : '#FFFFFF';

    return (
        <View style={{ flex: 1, backgroundColor: rootBackgroundColor }}>
            <SafeAreaView style={styles.container}>
                <View style={{ position: 'absolute', zIndex: 9999, width: '100%', alignItems: 'center', top: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 20 }}>
                    <Toast config={toastConfig} />
                </View>

            {/* Transparent / background-coloured status bar */}
            <StatusBar
                animated={true}
                translucent={true}
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <View style={styles.logoWrap}>
                            <Image
                                source={require('../../assets/logo.png')}
                                style={styles.logo}
                                contentFit="contain"
                            />
                        </View>
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.subtitle}>Sign in to continue your vibe</Text>
                    </View>

                    <View style={styles.formContainer}>

                        {/* Email Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <View style={[styles.inputContainer, focusedInput === 'email' && styles.inputFocused]}>
                                <Mail
                                    size={18}
                                    color={focusedInput === 'email' ? colors.iconActive : colors.iconInactive}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    placeholder="you@example.com"
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
                        </View>

                        {/* Password Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <View style={[styles.inputContainer, focusedInput === 'password' && styles.inputFocused]}>
                                <Lock
                                    size={18}
                                    color={focusedInput === 'password' ? colors.iconActive : colors.iconInactive}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    placeholder="••••••••"
                                    style={styles.input}
                                    placeholderTextColor={colors.placeholderColor}
                                    secureTextEntry={hidePassword}
                                    value={password}
                                    onChangeText={setPassword}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                                <TouchableOpacity
                                    onPress={() => setHidePassword(!hidePassword)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    {hidePassword ? (
                                        <EyeOff size={18} color={colors.iconInactive} />
                                    ) : (
                                        <Eye size={18} color={colors.iconInactive} />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Login Button */}
                        <TouchableOpacity
                            style={styles.loginButton}
                            onPress={handleLogin}
                            activeOpacity={0.8}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.loginButtonText}>Sign In</Text>
                            )}
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or continue with</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {Platform.OS === 'ios' ? (
                            <View style={{ gap: 10 }}>
                                {/* Google + Apple side by side */}
                                <View style={styles.socialRow}>
                                    <GoogleIconButton page="login" />
                                    <AppleButtonAuth page="login" />
                                </View>
                                {/* Full-width Lazorkit button */}
                                <ButtonLazorKitSignIn
                                    onSuccess={handleWalletSuccess}
                                    onError={handleWalletError}
                                />
                            </View>
                        ) : (
                            <View style={{ gap: 12 }}>
                                <GoogleButtonAuth page="login" />
                                <ButtonWalletSignIn onSuccess={handleWalletSuccess} onError={handleWalletError} />
                            </View>
                        )}

                        {/* Footer */}
                        <View style={styles.footerContainer}>
                            <Text style={styles.footerText}>Don't have an account?</Text>
                            <TouchableOpacity onPress={() => router.replace('/register')}>
                                <Text style={styles.registerLink}> Register</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
        </View>
    );
}


const getModernTheme = (isDark: boolean, accentColor: string) => {
    const colors = {
        placeholderColor: isDark ? '#666' : '#999',
        iconActive: accentColor,
        iconInactive: isDark ? '#666' : '#999',
    };

    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: 'transparent',
        },
        scrollContent: {
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: Platform.OS === 'android' ? 160 : 80,
            paddingTop: Platform.OS === 'android' ? statusBarHeight + 12 : 20,
        },
        headerContainer: {
            alignItems: 'center',
            marginBottom: 14,
        },
        logoWrap: {
            width: 60,
            height: 60,
            marginBottom: 10,
            justifyContent: 'center',
            alignItems: 'center',
        },
        logo: {
            width: 60,
            height: 60,
            borderRadius: 12,
        },
        title: {
            fontSize: 22,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            color: isDark ? '#FFFFFF' : '#000000',
            marginBottom: 4,
            letterSpacing: -0.3,
        },
        subtitle: {
            fontSize: 13,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            color: isDark ? '#888' : '#777',
            textAlign: 'center',
        },
        formContainer: {
            width: '100%',
        },
        inputGroup: {
            marginBottom: 14,
        },
        inputLabel: {
            fontSize: 11,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            color: isDark ? '#888' : '#777',
            marginBottom: 4,
            marginLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#120D1A' : '#F7F7F7',
            borderRadius: 12,
            paddingHorizontal: 14,
            height: Platform.OS === 'ios' ? 44 : 48,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        inputFocused: {
            borderColor: accentColor,
            backgroundColor: isDark ? '#150E1F' : '#FFFFFF',
        },
        inputIcon: {
            marginRight: 10,
        },
        input: {
            flex: 1,
            height: '100%',
            color: isDark ? '#FFFFFF' : '#000000',
            fontSize: 15,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        loginButton: {
            backgroundColor: accentColor,
            borderRadius: 14,
            paddingVertical: Platform.OS === 'ios' ? 14 : 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 8,
            shadowColor: accentColor,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 5,
        },
        loginButtonText: {
            color: '#ffffff',
            fontSize: 16,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            letterSpacing: 0.4,
        },
        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: 14,
        },
        dividerLine: {
            flex: 1,
            height: 1,
            backgroundColor: isDark ? '#1F1A2A' : '#EAEAEA',
        },
        dividerText: {
            paddingHorizontal: 14,
            color: isDark ? '#666' : '#999',
            fontSize: 12,
        },
        socialRow: {
            flexDirection: 'row',
            gap: 10,
        },
        footerContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 14,
        },
        footerText: {
            color: isDark ? '#888' : '#777',
            fontSize: 14,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        registerLink: {
            color: accentColor,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            fontSize: 14,
        },
    });

    return { styles, colors };
};