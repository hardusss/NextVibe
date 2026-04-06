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
    useColorScheme,
    BackHandler,
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
import FastImage from 'react-native-fast-image';

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

    /** Called by ButtonRegister after a failed API response */
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
        if (!password.length) return isDark ? '#333' : '#e0e0e0';
        return ['#ff4d4d', '#ff944d', '#ffda4d', ACCENT, '#00cc66'][strengthScore]
            ?? (isDark ? '#333' : '#e0e0e0');
    };

    useEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => handler.remove();
    }, []);

    const hasError = (field: keyof FieldErrors) => !!fieldErrors[field];
    const iconColor = (field: string) =>
        hasError(field as keyof FieldErrors)
            ? (isDark ? '#fca5a5' : '#ef4444')
            : focusedInput === field
                ? colors.iconActive
                : colors.iconInactive;

    const inputStyle = (field: keyof FieldErrors) => [
        styles.inputContainer,
        focusedInput === field && !hasError(field) && styles.inputFocused,
        hasError(field) && styles.inputError,
    ];

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.toastWrap}>
                <Toast config={toastConfig} />
            </View>

            <StatusBar
                animated
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={isDark ? '#0A0410' : '#ffffff'}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
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

                        {/* Username */}
                        <Animated.View style={{ transform: [{ translateX: shakeAnims.username }] }}>
                            <View style={inputStyle('username')}>
                                <User size={20} color={iconColor('username')} style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Username"
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
                                    <AlertCircle size={12} color={isDark ? '#fca5a5' : '#ef4444'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#ef4444' }]}>
                                        {fieldErrors.username}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* Email */}
                        <Animated.View style={{ transform: [{ translateX: shakeAnims.email }] }}>
                            <View style={inputStyle('email')}>
                                <Mail size={20} color={iconColor('email')} style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Email Address"
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
                                    <AlertCircle size={12} color={isDark ? '#fca5a5' : '#ef4444'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#ef4444' }]}>
                                        {fieldErrors.email}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* Password */}
                        <Animated.View style={{ transform: [{ translateX: shakeAnims.password }] }}>
                            <View style={inputStyle('password')}>
                                <Lock size={20} color={iconColor('password')} style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Password"
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
                                        ? <EyeOff size={20} color={colors.iconInactive} />
                                        : <Eye size={20} color={colors.iconInactive} />
                                    }
                                </TouchableOpacity>
                            </View>
                            {hasError('password') && (
                                <View style={styles.errorRow}>
                                    <AlertCircle size={12} color={isDark ? '#fca5a5' : '#ef4444'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#ef4444' }]}>
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
                                                { backgroundColor: strengthScore > level ? getStrengthColor() : (isDark ? '#333' : '#e0e0e0') },
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
                            <View style={inputStyle('inviteCode')}>
                                <Ticket size={20} color={iconColor('inviteCode')} style={styles.inputIcon} />
                                <TextInput
                                    placeholder="Invite Code"
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
                                    <AlertCircle size={12} color={isDark ? '#fca5a5' : '#ef4444'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#ef4444' }]}>
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
                                    color={hasError('privacy') ? '#ef4444' : ACCENT}
                                    uncheckedColor={hasError('privacy') ? '#ef4444' : colors.iconInactive}
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
                                <View style={[styles.errorRow, { marginTop: -16, marginBottom: 12 }]}>
                                    <AlertCircle size={12} color={isDark ? '#fca5a5' : '#ef4444'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#fca5a5' : '#ef4444' }]}>
                                        {fieldErrors.privacy}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>

                        <View style={{ marginTop: 10 }}>
                            <ButtonRegister
                                username={username}
                                email={email}
                                password={password}
                                strength={strengthLabel}
                                privacy={checked}
                                inviteCode={inviteCode}
                                onFieldError={setFieldError}
                                onApiError={handleApiError}
                            />
                        </View>

                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <GoogleButtonAuth page="register" />

                        <View style={styles.footerContainer}>
                            <Text style={styles.footerText}>Already have an account?</Text>
                            <TouchableOpacity onPress={() => router.replace('/login')}>
                                <Text style={styles.loginLink}>Login</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getTheme = (isDark: boolean, accent: string) => {
    const colors = {
        placeholder: isDark ? '#666' : '#999',
        iconActive: accent,
        iconInactive: isDark ? '#666' : '#999',
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#ffffff',
        },
        toastWrap: {
            position: 'absolute',
            zIndex: 9999,
            width: '100%',
            alignItems: 'center',
        },
        scrollContent: {
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 40,
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
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            color: isDark ? '#ffffff' : '#1a1a1a',
            marginBottom: 8,
        },
        subtitle: {
            fontSize: 14,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
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
            marginBottom: 6,
            borderWidth: 1.5,
            borderColor: 'transparent',
        },
        inputFocused: {
            borderColor: accent,
            backgroundColor: isDark ? '#1F1B2E' : '#f3e8ff',
        },
        inputError: {
            borderColor: isDark ? '#fca5a5' : '#ef4444',
            backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
        },
        inputIcon: {
            marginRight: 12,
        },
        input: {
            flex: 1,
            height: '100%',
            color: isDark ? '#fff' : '#000',
            fontSize: 16,
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
            marginBottom: 12,
            paddingHorizontal: 4,
        },
        errorText: {
            fontSize: 12,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        strengthContainer: {
            marginTop: 2,
            marginBottom: 16,
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
            marginBottom: 24,
            marginTop: 8,
        },
        privacyText: {
            fontSize: 13,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            color: isDark ? '#ccc' : '#444',
            flex: 1,
            marginLeft: 4,
            lineHeight: 20,
        },
        linkText: {
            color: accent,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
        },
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
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
        },
        footerContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 24,
        },
        footerText: {
            color: isDark ? '#888' : '#666',
            fontSize: 14,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        loginLink: {
            color: accent,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            marginLeft: 6,
            fontSize: 14,
        },
    });

    return { styles, colors };
};