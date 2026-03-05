import React, { useState, useEffect } from 'react';
import { 
    Text, 
    View, 
    TextInput, 
    TouchableOpacity, 
    SafeAreaView, 
    StatusBar, 
    ScrollView, 
    StyleSheet, 
    KeyboardAvoidingView, 
    Platform,
    useColorScheme,
    ActivityIndicator
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../src/config/toast-config';
import Login from '../../src/api/login';
import { useRouter } from "expo-router";
import GoogleButtonAuth from '../oauth-components/GoogleButton';
import FastImage from 'react-native-fast-image';
import { BackHandler } from "react-native";

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
        const handler = BackHandler.addEventListener(
            "hardwareBackPress",
            () => true 
        );

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
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.headerContainer}>
                        <FastImage 
                            source={require('../../assets/logo.png')} 
                            style={styles.logo} 
                            resizeMode={FastImage.resizeMode.contain}
                        />
                        <Text style={styles.title}>Welcome Back!</Text>
                        <Text style={styles.subtitle}>Login to continue your vibe</Text>
                    </View>

                    <View style={styles.formContainer}>
                        
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
                                onChangeText={setPassword}
                                onFocus={() => setFocusedInput('password')}
                                onBlur={() => setFocusedInput(null)}
                            />
                            <TouchableOpacity onPress={() => setHidePassword(!hidePassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialIcons
                                    name={hidePassword ? 'visibility-off' : 'visibility'}
                                    size={22}
                                    color={colors.iconInactive}
                                />
                            </TouchableOpacity>
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
                                <Text style={styles.loginButtonText}>Login</Text>
                            )}
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <GoogleButtonAuth page='login'/>

                        {/* Footer */}
                        <View style={styles.footerContainer}>
                            <Text style={styles.footerText}>Don't have an account?</Text>
                            <TouchableOpacity onPress={() => router.replace("/register")}>
                                <Text style={styles.registerLink}>Register</Text>
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
            fontFamily: "Dank Mono Bold",
includeFontPadding:false,
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
            marginBottom: 20, 
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

        loginButton: {
            backgroundColor: "#391b78ff",
            borderRadius: 10,
            paddingVertical: 15,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 20,
            elevation: 7,
        },
        loginButtonText: {
            color: '#ffffff',
            fontSize: 16,
            fontFamily: "Dank Mono Bold",
includeFontPadding:false,
            letterSpacing: 0.5,
        },

        // Divider
        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: 30,
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
            fontFamily: "Dank Mono Bold",
includeFontPadding:false,
        },

        // Footer
        footerContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 30,
        },
        footerText: {
            color: isDark ? '#888' : '#666',
            fontSize: 14,
        },
        registerLink: {
            color: accentColor,
            fontFamily: "Dank Mono Bold",
includeFontPadding:false,
            marginLeft: 6,
            fontSize: 14,
        },
    });

    return { styles, colors };
};