import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
    View, 
    Text, 
    TouchableOpacity, 
    StyleSheet, 
    useColorScheme, 
    TextInput, 
    Vibration, 
    ActivityIndicator,
    Keyboard
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps
} from '@gorhom/bottom-sheet';
import { KeyRound, ShieldAlert } from 'lucide-react-native';
import resetPassword from "@/src/api/reset.password";
import { usePopup } from "../Popup";

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const darkColors = {
    background: "#130822",
    textPrimary: "#ffffff",
    textSecondary: "#8b949e",
    border: "#2A1846",
    accent: "#05f0d8",
    link: "#a371f7",
    danger: "#ff4d4d",
    inputBackground: "transparent"
};

const lightColors = {
    background: "#ffffff",
    textPrimary: "#000000",
    textSecondary: "#666666",
    border: "#e5e5e5",
    accent: "#05f0d8",
    link: "#7b05f1",
    danger: "#ef4444",
    inputBackground: "transparent"
};

const ResetPasswordSheet = ({ isVisible, onClose, onSuccess }: Props) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const colors = isDarkMode ? darkColors : lightColors;
    const styles = getStyles(colors);
    const { showPopup } = usePopup();
    
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    useEffect(() => {
        if (isVisible) {
            setCode('');
            setPassword('');
            setConfirmPassword('');
            setPasswordError('');
            bottomSheetModalRef.current?.present();
        } else {
            Keyboard.dismiss();
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            onClose();
        }
    }, [onClose]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={isDarkMode ? 0.7 : 0.4}
            />
        ),
        [isDarkMode]
    );

    const handleCodeChange = (text: string) => {
        const formattedText = text.replace(/[^0-9]/g, '').slice(0, 6);
        setCode(formattedText);
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
            const response = await resetPassword({
                code: code,
                newPassword: password
            });
            
            if (response.status !== 200) {
                showPopup("error", "Error", response.data.message);
                setIsLoading(false);
                return;
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

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={['75%']}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
            enablePanDownToClose={true}
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
        >
            <BottomSheetView style={styles.contentContainer}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>Enter the 6-digit code from your authenticator app and a new password</Text>

                <View style={styles.section}>
                    <Text style={styles.label}>AUTHENTICATOR CODE</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        maxLength={6}
                        value={code}
                        onChangeText={handleCodeChange}
                        placeholder="000000"
                        placeholderTextColor={colors.textSecondary}
                        selectionColor={colors.accent}
                    />
                </View>
                
                <View style={styles.section}>
                    <Text style={styles.label}>NEW PASSWORD</Text>
                    <TextInput
                        style={styles.input}
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textSecondary}
                        selectionColor={colors.accent}
                    />
                </View>
                
                <View style={styles.section}>
                    <Text style={styles.label}>CONFIRM PASSWORD</Text>
                    <TextInput
                        style={styles.input}
                        secureTextEntry
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textSecondary}
                        selectionColor={colors.accent}
                    />
                </View>
                
                {passwordError ? (
                    <View style={styles.errorContainer}>
                        <ShieldAlert size={16} color={colors.danger} />
                        <Text style={styles.errorText}>{passwordError}</Text>
                    </View>
                ) : null}
                
                <View style={styles.spacer} />

                <TouchableOpacity 
                    style={[styles.row, styles.lastRow]} 
                    onPress={handleResetPassword}
                    disabled={isLoading}
                >
                    <View style={styles.rowLeft}>
                        {isLoading ? (
                            <ActivityIndicator size="small" color={colors.link} />
                        ) : (
                            <KeyRound size={24} color={colors.link} strokeWidth={1.5} />
                        )}
                        <Text style={styles.linkTextMain}>
                            {isLoading ? 'Resetting...' : 'Confirm Reset Password'}
                        </Text>
                    </View>
                </TouchableOpacity>

            </BottomSheetView>
        </BottomSheetModal>
    );
};

const getStyles = (colors: any) => StyleSheet.create({
    bottomSheetBackground: {
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    handleIndicator: {
        backgroundColor: colors.border,
        width: 40,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 40,
    },
    title: {
        fontSize: 22,
        fontWeight: "600",
        color: colors.textPrimary,
        letterSpacing: 0.5,
        marginBottom: 8,
        textAlign: "center"
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: 32,
        fontWeight: "400",
        paddingHorizontal: 10,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.textSecondary,
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.inputBackground,
        color: colors.textPrimary,
        fontSize: 18,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        minHeight: 40,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -10,
        marginBottom: 16,
    },
    errorText: {
        color: colors.danger,
        fontSize: 13,
        marginLeft: 6,
        fontWeight: '500',
    },
    spacer: {
        flex: 1,
        minHeight: 20,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 18,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    lastRow: {
        borderBottomWidth: 0,
    },
    rowLeft: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    linkTextMain: {
        fontSize: 16,
        color: colors.link,
        fontWeight: "500",
        marginLeft: 12,
    },
});

export default ResetPasswordSheet;