import {
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Linking,
    StatusBar,
    ScrollView,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
    SafeAreaView,
    Animated,
} from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { Checkbox } from 'react-native-paper';
import { User, Mail, Lock, Eye, EyeOff, Ticket, AlertCircle } from 'lucide-react-native';
import ButtonRegister from './button';
import zxcvbn from 'zxcvbn';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import { useRouter } from 'expo-router';
import GoogleButtonAuth from '../oauth-components/GoogleButton';
import GoogleIconButton from '../oauth-components/GoogleIconButton';
import AppleButtonAuth from '../oauth-components/AppleButton';
import { Image } from 'expo-image';
import ButtonWalletSignIn from '../SignInViaWallet/ButtonWalletSignIn';
import ButtonLazorKitSignIn from '../SignInViaWallet/ButtonLazorKitSignIn';
import * as NavigationBar from 'expo-navigation-bar';

type FieldErrors = {
    username?: string;
    email?: string;
    password?: string;
    inviteCode?: string;
    privacy?: string;
};

export default function RegisterView() {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const ACCENT = isDark ? '#A78BFA' : '#7C3AED';

    const [hidePassword, setHidePassword] = useState(true);
    const [checked, setChecked] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [strengthScore, setStrengthScore] = useState(0);
    const [strengthLabel, setStrengthLabel] = useState('');
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const shakeAnims = useRef<Record<string, Animated.Value>>({
        username: new Animated.Value(0),
        email: new Animated.Value(0),
        password: new Animated.Value(0),
        inviteCode: new Animated.Value(0),
        privacy: new Animated.Value(0),
    }).current;

    const { styles, colors } = getTheme(isDark, ACCENT);

    const shake = (field: string) => {
        const anim = shakeAnims[field];
        if (!anim) return;
        anim.setValue(0);
        Animated.sequence([
            Animated.timing(anim, { toValue: -8, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 8, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: -5, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 5, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    };

    const setFieldError = (field: keyof FieldErrors, message: string) => {
        setFieldErrors(prev => ({ ...prev, [field]: message }));
        shake(field);
    };

    const clearFieldError = (field: keyof FieldErrors) => {
        if (fieldErrors[field]) {
            setFieldErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const handleApiError = (error: any) => {
        const serverError = error?.response?.data?.error;
        const detail = error?.response?.data?.detail;
        const status = error?.response?.status;

        if (serverError === 'invalid_invite_code') {
            setFieldError('inviteCode', 'Invalid or expired invite code');
            return;
        }
        if (serverError === 'username_taken' || status === 409) {
            setFieldError('username', 'This username is already taken');
            return;
        }
        if (detail?.toLowerCase().includes('email')) {
            setFieldError('email', detail);
            return;
        }
        if (detail?.toLowerCase().includes('username')) {
            setFieldError('username', detail);
            return;
        }
        if (!error?.response) {
            Toast.show({ type: 'error', text1: 'Network error', text2: 'Check your connection and try again.' });
            return;
        }
        Toast.show({ type: 'error', text1: 'Registration failed', text2: detail ?? 'Something went wrong.' });
    };

    const handlePasswordChange = (text: string) => {
        setPassword(text);
        const result = zxcvbn(text);
        setStrengthScore(result.score);
        setStrengthLabel(['Too Weak', 'Weak', 'Good', 'Strong', 'Excellent'][result.score]);
        clearFieldError('password');
    };

    const getStrengthColor = () => {
        if (!password.length) return isDark ? '#2A2440' : '#E5E5EA';
        return ['#FF453A', '#FF9F0A', '#FFD60A', ACCENT, '#30D158'][strengthScore]
            ?? (isDark ? '#2A2440' : '#E5E5EA');
    };

    const hasError = (field: keyof FieldErrors) => !!fieldErrors[field];
    const iconColor = (field: string) =>
        hasError(field as keyof FieldErrors)
            ? (isDark ? '#FF6B6B' : '#FF3B30')
            : focusedInput === field
                ? colors.iconActive
                : colors.iconInactive;

    const inputStyle = (field: keyof FieldErrors) => [
        styles.inputContainer,
        focusedInput === field && !hasError(field) && styles.inputFocused,
        hasError(field) && styles.inputError,
    ];

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
        /* ГОЛОВНИЙ ФІКС: Кореневий View заливає "чубок" і статус-бар iOS */
        <View style={{ flex: 1, backgroundColor: rootBackgroundColor }}>
            <SafeAreaView style={styles.container}>
                <View style={styles.toastWrap}>
                    <Toast config={toastConfig} />
                </View>

                <StatusBar
                    animated
                    translucent={true}
                    barStyle={isDark ? 'light-content' : 'dark-content'}
                    backgroundColor="transparent"
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.headerContainer}>
                            <View style={styles.logoWrap}>
                                <Image
                                    source={require('../../assets/logo.png')}
                                    style={styles.logo}
                                    contentFit="contain"
                                />
                            </View>
                            <Text style={styles.title}>Create Account</Text>
                            <Text style={styles.subtitle}>Start your vibe journey today</Text>
                        </View>

                        <View style={styles.formContainer}>

                            {/* Username */}
                            <Animated.View style={{ transform: [{ translateX: shakeAnims.username }] }}>
                                <Text style={styles.inputLabel}>Username</Text>
                                <View style={inputStyle('username')}>
                                    <User size={18} color={iconColor('username')} style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="your_username"
                                        style={styles.input}
                                        placeholderTextColor={colors.placeholder}
                                        value={username}
                                        onChangeText={t => { setUsername(t); clearFieldError('username'); }}
                                        onFocus={() => setFocusedInput('username')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                </View>
                                {hasError('username') && (
                                    <View style={styles.errorRow}>
                                        <AlertCircle size={12} color={isDark ? '#FF6B6B' : '#FF3B30'} />
                                        <Text style={[styles.errorText, { color: isDark ? '#FF6B6B' : '#FF3B30' }]}>
                                            {fieldErrors.username}
                                        </Text>
                                    </View>
                                )}
                            </Animated.View>

                            {/* Email */}
                            <Animated.View style={{ transform: [{ translateX: shakeAnims.email }] }}>
                                <Text style={styles.inputLabel}>Email</Text>
                                <View style={inputStyle('email')}>
                                    <Mail size={18} color={iconColor('email')} style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="you@example.com"
                                        style={styles.input}
                                        placeholderTextColor={colors.placeholder}
                                        value={email}
                                        onChangeText={t => { setEmail(t); clearFieldError('email'); }}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        onFocus={() => setFocusedInput('email')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                </View>
                                {hasError('email') && (
                                    <View style={styles.errorRow}>
                                        <AlertCircle size={12} color={isDark ? '#FF6B6B' : '#FF3B30'} />
                                        <Text style={[styles.errorText, { color: isDark ? '#FF6B6B' : '#FF3B30' }]}>
                                            {fieldErrors.email}
                                        </Text>
                                    </View>
                                )}
                            </Animated.View>

                            {/* Password */}
                            <Animated.View style={{ transform: [{ translateX: shakeAnims.password }] }}>
                                <Text style={styles.inputLabel}>Password</Text>
                                <View style={inputStyle('password')}>
                                    <Lock size={18} color={iconColor('password')} style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="••••••••"
                                        style={styles.input}
                                        placeholderTextColor={colors.placeholder}
                                        secureTextEntry={hidePassword}
                                        value={password}
                                        onChangeText={handlePasswordChange}
                                        onFocus={() => setFocusedInput('password')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setHidePassword(v => !v)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        {hidePassword
                                            ? <EyeOff size={18} color={colors.iconInactive} />
                                            : <Eye size={18} color={colors.iconInactive} />
                                        }
                                    </TouchableOpacity>
                                </View>
                                {hasError('password') && (
                                    <View style={styles.errorRow}>
                                        <AlertCircle size={12} color={isDark ? '#FF6B6B' : '#FF3B30'} />
                                        <Text style={[styles.errorText, { color: isDark ? '#FF6B6B' : '#FF3B30' }]}>
                                            {fieldErrors.password}
                                        </Text>
                                    </View>
                                )}
                            </Animated.View>

                            {/* Strength bar */}
                            {password.length > 0 && (
                                <View style={styles.strengthContainer}>
                                    <View style={styles.strengthBarContainer}>
                                        {[0, 1, 2, 3].map(level => (
                                            <View
                                                key={level}
                                                style={[
                                                    styles.strengthBarItem,
                                                    { backgroundColor: strengthScore > level ? getStrengthColor() : (isDark ? '#2A2440' : '#E5E5EA') },
                                                ]}
                                            />
                                        ))}
                                    </View>
                                    <Text style={[styles.strengthText, { color: getStrengthColor() }]}>
                                        {strengthLabel}
                                    </Text>
                                </View>
                            )}

                            {/* Invite code */}
                            <Animated.View style={{ transform: [{ translateX: shakeAnims.inviteCode }] }}>
                                <Text style={styles.inputLabel}>Invite Code <Text style={styles.optionalTag}>(optional)</Text></Text>
                                <View style={inputStyle('inviteCode')}>
                                    <Ticket size={18} color={iconColor('inviteCode')} style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="XXXXXX"
                                        style={styles.input}
                                        placeholderTextColor={colors.placeholder}
                                        value={inviteCode}
                                        onChangeText={t => {
                                            setInviteCode(t);
                                            clearFieldError('inviteCode');
                                        }}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        maxLength={6}
                                        onFocus={() => setFocusedInput('invite')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                    {inviteCode.length > 0 && (
                                        <Text style={[
                                            styles.codeCount,
                                            { color: inviteCode.length === 6 ? ACCENT : colors.placeholder },
                                        ]}>
                                            {inviteCode.length}/6
                                        </Text>
                                    )}
                                </View>
                                {hasError('inviteCode') && (
                                    <View style={styles.errorRow}>
                                        <AlertCircle size={12} color={isDark ? '#FF6B6B' : '#FF3B30'} />
                                        <Text style={[styles.errorText, { color: isDark ? '#FF6B6B' : '#FF3B30' }]}>
                                            {fieldErrors.inviteCode}
                                        </Text>
                                    </View>
                                )}
                            </Animated.View>

                            {/* Terms */}
                            <Animated.View style={{ transform: [{ translateX: shakeAnims.privacy }] }}>
                                <View style={styles.privacyContainer}>
                                    <Checkbox.Android
                                        status={checked ? 'checked' : 'unchecked'}
                                        onPress={() => { setChecked(v => !v); clearFieldError('privacy'); }}
                                        color={hasError('privacy') ? '#FF3B30' : ACCENT}
                                        uncheckedColor={hasError('privacy') ? '#FF3B30' : colors.iconInactive}
                                    />
                                    <Text style={styles.privacyText}>
                                        I agree to the{' '}
                                        <Text style={styles.linkText} onPress={() => Linking.openURL('https://nextvibe.io/privacy')}>
                                            Privacy Policy
                                        </Text>
                                        {' '}and{' '}
                                        <Text style={styles.linkText} onPress={() => Linking.openURL('https://nextvibe.io/terms')}>
                                            Terms of Use
                                        </Text>
                                    </Text>
                                </View>
                                {hasError('privacy') && (
                                    <View style={[styles.errorRow, { marginTop: -14, marginBottom: 10 }]}>
                                        <AlertCircle size={12} color={isDark ? '#FF6B6B' : '#FF3B30'} />
                                        <Text style={[styles.errorText, { color: isDark ? '#FF6B6B' : '#FF3B30' }]}>
                                            {fieldErrors.privacy}
                                        </Text>
                                    </View>
                                )}
                            </Animated.View>

                            <View style={{ marginTop: 8 }}>
                                <ButtonRegister
                                    username={username}
                                    email={email}
                                    password={password}
                                    strength={strengthLabel}
                                    privacy={checked}
                                    inviteCode={inviteCode}
                                    onFieldError={setFieldError as (field: string, msg: string) => void}
                                    onApiError={handleApiError}
                                />
                            </View>

                            <View style={styles.dividerContainer}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>or continue with</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            {Platform.OS === 'ios' ? (
                                <View style={{ gap: 10 }}>
                                    <View style={styles.socialRow}>
                                        <GoogleIconButton page="register" />
                                        <AppleButtonAuth page="register" />
                                    </View>
                                    <ButtonLazorKitSignIn onSuccess={handleWalletSuccess} onError={handleWalletError} />
                                </View>
                            ) : (
                                <View style={{ gap: 12 }}>
                                    <GoogleButtonAuth page="register" />
                                    <ButtonWalletSignIn onSuccess={handleWalletSuccess} onError={handleWalletError} />
                                </View>
                            )}

                            <View style={styles.footerContainer}>
                                <Text style={styles.footerText}>Already have an account?</Text>
                                <TouchableOpacity onPress={() => router.replace('/login')}>
                                    <Text style={styles.loginLink}> Sign In</Text>
                                </TouchableOpacity>
                            </View>

                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const getTheme = (isDark: boolean, accent: string) => {
    const colors = {
        placeholder: isDark ? '#666' : '#999',
        iconActive: accent,
        iconInactive: isDark ? '#666' : '#999',
    };

    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            /* ФІКС 2: Прозорий фон для SafeAreaView, щоб просвічувався кореневий View */
            backgroundColor: 'transparent', 
        },
        toastWrap: {
            position: 'absolute',
            zIndex: 9999,
            width: '100%',
            alignItems: 'center',
            top: Platform.OS === 'ios' ? 50 : statusBarHeight + 20,
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
        optionalTag: {
            fontFamily: 'Dank Mono',
            color: isDark ? '#555' : '#AAA',
            textTransform: 'none',
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#120D1A' : '#F7F7F7',
            borderRadius: 12,
            paddingHorizontal: 14,
            height: Platform.OS === 'ios' ? 44 : 48,
            marginBottom: 4,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        inputFocused: {
            borderColor: accent,
            backgroundColor: isDark ? '#150E1F' : '#FFFFFF',
        },
        inputError: {
            borderColor: isDark ? '#FF6B6B' : '#FF3B30',
            backgroundColor: isDark ? 'rgba(255,107,107,0.08)' : 'rgba(255,59,48,0.05)',
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
        codeCount: {
            fontSize: 12,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
        },
        errorRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            paddingHorizontal: 4,
        },
        errorText: {
            fontSize: 12,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        strengthContainer: {
            marginTop: 2,
            marginBottom: 14,
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
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
        },
        privacyContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        privacyText: {
            fontSize: 13,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            color: isDark ? '#888' : '#666',
            flex: 1,
            marginLeft: 4,
        },
        linkText: {
            color: accent,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
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
        loginLink: {
            color: accent,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            fontSize: 14,
        },
    });

    return { styles, colors };
};