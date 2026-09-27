import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react-native';
import {
    apiErrorMessage,
    requestPasswordReset,
    resetPasswordWithCode,
    type Session,
} from '@/src/api/emailCodes';
import haptics from '@/src/utils/haptics';
import EmailCodeStep from './EmailCodeStep';
import { authTheme } from './authTheme';

const MIN_PASSWORD = 8;

/** "Use at least 8 characters" / "Passwords don't match", or null when the pair is fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
    if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm.length > 0 && password !== confirm) return "Passwords don't match.";
    return null;
}

export function NewPasswordFields({ password, confirm, onPassword, onConfirm }: {
    password: string;
    confirm: string;
    onPassword: (value: string) => void;
    onConfirm: (value: string) => void;
}) {
    const isDark = useColorScheme() === 'dark';
    const { colors, styles } = authTheme(isDark);
    const [hidden, setHidden] = useState(true);
    const [focused, setFocused] = useState<'password' | 'confirm' | null>(null);
    const problem = password.length > 0 ? newPasswordProblem(password, confirm) : null;

    return (
        <>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>New password</Text>
                <View style={[styles.inputContainer, focused === 'password' && styles.inputFocused]}>
                    <Lock size={18} color={focused === 'password' ? colors.accent : colors.icon} style={styles.inputIcon} />
                    <TextInput
                        value={password}
                        onChangeText={onPassword}
                        placeholder="At least 8 characters"
                        placeholderTextColor={colors.placeholder}
                        style={styles.input}
                        secureTextEntry={hidden}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        onFocus={() => setFocused('password')}
                        onBlur={() => setFocused(null)}
                    />
                    <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}
                        accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
                        {hidden ? <EyeOff size={18} color={colors.icon} /> : <Eye size={18} color={colors.icon} />}
                    </TouchableOpacity>
                </View>
            </View>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Repeat it</Text>
                <View style={[styles.inputContainer, focused === 'confirm' && styles.inputFocused]}>
                    <Lock size={18} color={focused === 'confirm' ? colors.accent : colors.icon} style={styles.inputIcon} />
                    <TextInput
                        value={confirm}
                        onChangeText={onConfirm}
                        placeholder="Same password again"
                        placeholderTextColor={colors.placeholder}
                        style={styles.input}
                        secureTextEntry={hidden}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        onFocus={() => setFocused('confirm')}
                        onBlur={() => setFocused(null)}
                    />
                </View>
            </View>
            {!!problem && <Text style={[styles.message, { color: colors.muted }]}>{problem}</Text>}
        </>
    );
}

interface Props {
    initialEmail: string;
    /** The new session (other devices are signed out). */
    onDone: (session: Session) => Promise<void> | void;
    onBack: () => void;
}

/** Forgot password on the sign-in screen: email → code + new password. */
export default function ForgotPassword({ initialEmail, onDone, onBack }: Props) {
    const isDark = useColorScheme() === 'dark';
    const { colors, styles } = authTheme(isDark);
    const [email, setEmail] = useState(initialEmail.trim());
    const [sentTo, setSentTo] = useState<{ email: string; resendIn: number } | null>(null);
    const [sending, setSending] = useState(false);
    const [focused, setFocused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');

    const send = async () => {
        const address = email.trim();
        if (!/^\S+@\S+\.\S+$/.test(address)) {
            setError('Enter the email of your account.');
            return;
        }
        setSending(true);
        setError(null);
        try {
            const resendIn = await requestPasswordReset(address);
            setSentTo({ email: address, resendIn });
        } catch (e) {
            haptics.notification('error');
            setError(apiErrorMessage(e, "We couldn't send the code. Try again in a minute."));
        } finally {
            setSending(false);
        }
    };

    if (sentTo) {
        const ready = newPasswordProblem(password, confirm) === null && password === confirm;
        return (
            <EmailCodeStep
                email={sentTo.email}
                title="Set a new password"
                lead="If an account uses this email, we sent a 6-digit code to"
                submitLabel="Save password"
                initialResendIn={sentTo.resendIn}
                canSubmit={ready}
                onSubmit={async (code) => {
                    const session = await resetPasswordWithCode(sentTo.email, code, password);
                    await onDone(session);
                }}
                onResend={() => requestPasswordReset(sentTo.email)}
                onBack={() => setSentTo(null)}
                backLabel="Change email"
            >
                <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
            </EmailCodeStep>
        );
    }

    return (
        <View>
            <View style={styles.header}>
                <View style={styles.iconWrap}>
                    <KeyRound size={26} color={colors.accent} />
                </View>
                <Text style={styles.title}>Forgot your password?</Text>
                <Text style={styles.subtitle}>Enter your account's email and we'll send you a code to set a new one.</Text>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.inputContainer, focused && styles.inputFocused, !!error && styles.inputError]}>
                    <Mail size={18} color={focused ? colors.accent : colors.icon} style={styles.inputIcon} />
                    <TextInput
                        value={email}
                        onChangeText={(t) => { setEmail(t); if (error) setError(null); }}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.placeholder}
                        style={styles.input}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus={!initialEmail}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onSubmitEditing={send}
                        returnKeyType="send"
                    />
                </View>
            </View>

            {!!error && <Text style={[styles.message, { color: colors.danger }]}>{error}</Text>}

            <TouchableOpacity style={[styles.button, sending && styles.buttonDisabled]} onPress={send}
                activeOpacity={0.8} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
            </TouchableOpacity>

            <View style={[styles.links, { justifyContent: 'center' }]}>
                <TouchableOpacity onPress={onBack} hitSlop={8}>
                    <Text style={styles.linkMuted}>Back to sign in</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
