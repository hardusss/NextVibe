import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useColorScheme, PanResponder, TextInput, Vibration, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from "@/src/api/2fa";
import resetPassword from "@/src/api/reset.password";
import { usePopup } from "../Popup";

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ResetPasswordSheet = ({ isVisible, onClose, onSuccess }: Props) => {
    const isDark = useColorScheme() === 'dark';
    const translateY = useRef(new Animated.Value(300)).current;
    const styles = getStyles(isDark);
    const { showPopup } = usePopup();
    
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 50) {
                    onClose();
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 100,
                        friction: 8
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        Animated.spring(translateY, {
            toValue: isVisible ? 0 : 300,
            useNativeDriver: true,
            tension: 100,
            friction: 8
        }).start();
        
        if (isVisible) {
            setCode('');
            setPassword('');
            setConfirmPassword('');
            setPasswordError('');
        }
    }, [isVisible]);

    const handleCodeChange = (text: string) => {
        // Limit code length to 6 characters
        const formattedText = text.replace(/[^0-9]/g, '').slice(0, 6);
        setCode(formattedText);
    };

    const verifyCode = async () => {
        if (code.length !== 6) {
            showPopup('error', 'Error', 'Please enter a 6-digit code');
            return;
        }
        
        setIsLoading(true);
        try {
            const isValid = await auth(code);
            if (!isValid) {
                Vibration.vibrate();
                setCode('');
                showPopup('error', 'Error', 'Invalid authentication code. Please try again.');
            }
        } catch (error) {
            showPopup('error', 'Error', 'Failed to verify code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const validatePassword = () => {
        if (password.length < 8) {
            setPasswordError('Password must be at least 8 characters long');
            return false;
        }
        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return false;
        }
        setPasswordError('');
        return true;
    };

    const handleResetPassword = async () => {
        if (!validatePassword()) return;
        if (code.length !== 6) {
            showPopup('error', 'Error', 'Please enter a valid 6-digit code');
            return;
        }
        
        setIsLoading(true);
        try {
            const response =  await resetPassword({
                code: code,
                newPassword: password
            });
            if (response.status !== 200) {
                showPopup("error", "Error", response.data.message) 
            }
            
            showPopup('success', 'Success', 'Your password has been successfully reset.');
            onSuccess();
            onClose();
        } catch (error: any) {
            if (error.response && error.response.status === 400) {
                Vibration.vibrate();
                showPopup('error', 'Error', 'Invalid confirmation code. Please try again.');
            } else {
                showPopup('error', 'Error', 'Failed to reset password. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} activeOpacity={1} />
            <Animated.View style={[styles.container, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
                <View style={styles.headerContainer}>
                    <MaterialCommunityIcons name="lock-reset" size={30} color={isDark ? "#05f0d8" : "#007bff"} />
                    <Text style={styles.title}>Reset Password</Text>
                </View>
                
                <>
                    <Text style={styles.instruction}>Enter the 6-digit code from your Google Authenticator app and your new password</Text>
                    
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Verification Code</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            maxLength={6}
                            value={code}
                            onChangeText={handleCodeChange}
                            placeholder="Enter 6-digit code"
                            placeholderTextColor={isDark ? "#666" : "#999"}
                        />
                    </View>
                    
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>New Password</Text>
                        <TextInput
                            style={styles.input}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Enter new password"
                            placeholderTextColor={isDark ? "#666" : "#999"}
                        />
                    </View>
                    
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Confirm Password</Text>
                        <TextInput
                            style={styles.input}
                            secureTextEntry
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Confirm new password"
                            placeholderTextColor={isDark ? "#666" : "#999"}
                        />
                    </View>
                    
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                    
                    <TouchableOpacity 
                        style={styles.resetButton} 
                        onPress={handleResetPassword}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.resetButtonText}>Reset Password</Text>
                        )}
                    </TouchableOpacity>
                </>
            </Animated.View>
        </View>
    );
};

const darkColors = {
    background: 'rgb(31, 31, 32)',
    buttonBackground: '#1f1f1f',
    textColor: '#c9d1d9',
    accent: '#05f0d8',
    overlay: 'rgba(0, 0, 0, 0.5)',
    inputBackground: '#2d2d2d',
    errorColor: '#ff6b6b'
};

const lightColors = {
    background: '#ffffff',
    buttonBackground: '#e5e5e5',
    textColor: '#000000',
    accent: '#007bff',
    overlay: 'rgba(0, 0, 0, 0.3)',
    inputBackground: '#f5f5f5',
    errorColor: '#d32f2f'
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isDark ? darkColors.overlay : lightColors.overlay,
        justifyContent: 'flex-end',
        zIndex: 1000,
    },
    overlayTouchable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    container: {
        backgroundColor: isDark ? darkColors.background : lightColors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
        elevation: 5,
        maxHeight: '80%',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginLeft: 10,
    },
    instruction: {
        fontSize: 16,
        color: isDark ? darkColors.textColor : lightColors.textColor,
        marginBottom: 20,
        textAlign: 'center',
    },
    codeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 20,
    },
    codeInput: {
        width: 45,
        height: 55,
        borderWidth: 1,
        borderColor: isDark ? darkColors.accent : lightColors.accent,
        borderRadius: 8,
        textAlign: 'center',
        fontSize: 24,
        color: isDark ? darkColors.textColor : lightColors.textColor,
        backgroundColor: isDark ? darkColors.inputBackground : lightColors.inputBackground,
    },
    inputContainer: {
        marginBottom: 15,
    },
    label: {
        fontSize: 16,
        color: isDark ? '#8b949e' : '#666666',
        marginBottom: 5,
    },
    input: {
        backgroundColor: isDark ? darkColors.inputBackground : lightColors.inputBackground,
        color: isDark ? darkColors.textColor : lightColors.textColor,
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        fontSize: 16,
        borderWidth: 1,
        borderColor: isDark ? '#333' : '#ddd',
    },
    errorText: {
        color: isDark ? darkColors.errorColor : lightColors.errorColor,
        fontSize: 14,
        marginTop: 5,
        marginBottom: 15,
    },
    resetButton: {
        backgroundColor: isDark ? darkColors.accent : lightColors.accent,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default ResetPasswordSheet;