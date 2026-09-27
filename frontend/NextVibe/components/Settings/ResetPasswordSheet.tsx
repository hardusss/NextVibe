import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    useColorScheme,
    ActivityIndicator,
    Keyboard,
    Platform,
} from 'react-native';
import {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { KeyRound, ShieldAlert } from 'lucide-react-native';
import {
    apiErrorMessage,
    requestPasswordReset,
    resetPasswordWithCode,
    retryAfter,
    saveSession,
} from '@/src/api/emailCodes';
import haptics from '@/src/utils/haptics';

interface Props {
    isVisible: boolean;
    /** Where the code goes; without one there's nothing to reset with. */
    email?: string | null;
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

const MIN_PASSWORD = 8;

/**
 * Settings → Reset password: a 6-digit code goes to the account's email,
 * then the code and the new password set it. This device stays signed in
 * (the answer carries a new session); every other device is signed out.
 */
const ResetPasswordSheet = ({ isVisible, email, onClose, onSuccess }: Props) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const colors = isDarkMode ? darkColors : lightColors;
    const styles = getStyles(colors);

    const [step, setStep] = useState<'start' | 'code'>('start');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [resendIn, setResendIn] = useState(0);

    useEffect(() => {
        if (isVisible) {
            setStep('start');
            setCode('');
            setPassword('');
            setConfirmPassword('');
            setError('');
            setNotice('');
            bottomSheetModalRef.current?.present();
        } else {
            Keyboard.dismiss();
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendIn]);

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

    const sendCode = async () => {
        if (!email || isLoading || resendIn > 0) return;
        setIsLoading(true);
        setError('');
        setNotice('');
        try {
            setResendIn(await requestPasswordReset(email));
            if (step === 'code') setNotice('A new code is on its way.');
            setStep('code');
        } catch (e) {
            const wait = retryAfter(e);
            if (wait) setResendIn(wait);
            setError(apiErrorMessage(e, "We couldn't send the code. Try again in a minute."));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!email || isLoading) return;
        if (code.length !== 6) {
            setError('Enter the 6-digit code from the email.');
            return;
        }
        if (password.length < MIN_PASSWORD) {
            setError(`Use at least ${MIN_PASSWORD} characters.`);
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.");
            return;
        }
        setIsLoading(true);
        setError('');
        setNotice('');
        try {
            const session = await resetPasswordWithCode(email, code, password);
            await saveSession(session);
            haptics.notification('success');
            onSuccess();
            onClose();
        } catch (e) {
            haptics.notification('error');
            setError(apiErrorMessage(e, 'Failed to reset password. Please try again.'));
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
                <Text style={styles.title}>Reset password</Text>
                {!email ? (
                    <Text style={styles.subtitle}>
                        Add an email to your account first. The code to set a password goes there.
                    </Text>
                ) : step === 'start' ? (
                    <Text style={styles.subtitle}>
                        We'll email a 6-digit code to <Text style={styles.strong}>{email}</Text>. You'll set the new password with it.
                    </Text>
                ) : (
                    <Text style={styles.subtitle}>
                        Enter the code we sent to <Text style={styles.strong}>{email}</Text> and your new password.
                    </Text>
                )}

                {!!email && step === 'code' && (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.label}>CODE FROM THE EMAIL</Text>
                            <BottomSheetTextInput
                                style={styles.input}
                                keyboardType="number-pad"
                                textContentType="oneTimeCode"
                                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                                maxLength={6}
                                value={code}
                                onChangeText={(text) => { setCode(text.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
                                placeholder="000000"
                                placeholderTextColor={colors.textSecondary}
                                selectionColor={colors.accent}
                            />
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.label}>NEW PASSWORD</Text>
                            <BottomSheetTextInput
                                style={styles.input}
                                secureTextEntry
                                textContentType="newPassword"
                                autoComplete="new-password"
                                value={password}
                                onChangeText={(text) => { setPassword(text); setError(''); }}
                                placeholder="At least 8 characters"
                                placeholderTextColor={colors.textSecondary}
                                selectionColor={colors.accent}
                            />
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.label}>CONFIRM PASSWORD</Text>
                            <BottomSheetTextInput
                                style={styles.input}
                                secureTextEntry
                                textContentType="newPassword"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChangeText={(text) => { setConfirmPassword(text); setError(''); }}
                                placeholder="••••••••"
                                placeholderTextColor={colors.textSecondary}
                                selectionColor={colors.accent}
                            />
                        </View>

                        <TouchableOpacity onPress={sendCode} disabled={resendIn > 0 || isLoading} hitSlop={8}>
                            <Text style={[styles.resend, (resendIn > 0 || isLoading) && { color: colors.textSecondary }]}>
                                {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}

                {error ? (
                    <View style={styles.errorContainer}>
                        <ShieldAlert size={16} color={colors.danger} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : notice ? (
                    <Text style={styles.notice}>{notice}</Text>
                ) : null}

                <View style={styles.spacer} />

                <TouchableOpacity
                    style={[styles.row, styles.lastRow]}
                    onPress={!email ? onClose : step === 'start' ? sendCode : handleResetPassword}
                    disabled={isLoading}
                >
                    <View style={styles.rowLeft}>
                        {isLoading ? (
                            <ActivityIndicator size="small" color={colors.link} />
                        ) : (
                            <KeyRound size={24} color={colors.link} strokeWidth={1.5} />
                        )}
                        <Text style={styles.linkTextMain}>
                            {!email ? 'Close' : step === 'start'
                                ? (isLoading ? 'Sending…' : 'Send code')
                                : (isLoading ? 'Saving…' : 'Save new password')}
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
        lineHeight: 20,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: 28,
        fontWeight: "400",
        paddingHorizontal: 10,
    },
    strong: {
        color: colors.textPrimary,
        fontWeight: "600",
    },
    section: {
        marginBottom: 22,
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
    resend: {
        color: colors.link,
        fontSize: 14,
        fontWeight: "600",
        marginTop: -6,
        marginBottom: 16,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    errorText: {
        color: colors.danger,
        fontSize: 13,
        marginLeft: 6,
        fontWeight: '500',
        flexShrink: 1,
    },
    notice: {
        color: colors.link,
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 16,
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
