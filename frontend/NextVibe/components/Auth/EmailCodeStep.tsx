import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import { MailCheck } from 'lucide-react-native';
import { apiErrorMessage, retryAfter } from '@/src/api/emailCodes';
import haptics from '@/src/utils/haptics';
import { authTheme } from './authTheme';

interface Props {
    email: string;
    title: string;
    /** Shown before the address: "We sent a 6-digit code to" */
    lead?: string;
    submitLabel: string;
    /** Seconds before "Send a new code" works (the server's resendIn). */
    initialResendIn: number;
    /** Shown until the next action, e.g. the code email couldn't be sent. */
    initialError?: string;
    /** Submits by itself once 6 digits are in (no other fields to fill). */
    autoSubmit?: boolean;
    /** Other fields must be valid first (e.g. the new password). */
    canSubmit?: boolean;
    /** Throws on failure; the server's message is shown. */
    onSubmit: (code: string) => Promise<void>;
    /** Sends a new code; answers the seconds until the next one. */
    onResend: () => Promise<number>;
    onBack: () => void;
    backLabel?: string;
    children?: React.ReactNode;
}

/**
 * Enter the 6-digit code from the email: confirming the email at sign-in or
 * sign-up, and resetting a password (with the password fields as children).
 */
export default function EmailCodeStep({
    email, title, lead = 'We sent a 6-digit code to', submitLabel, initialResendIn, initialError,
    autoSubmit = false, canSubmit = true, onSubmit, onResend, onBack, backLabel = 'Back', children,
}: Props) {
    const isDark = useColorScheme() === 'dark';
    const { colors, styles } = authTheme(isDark);
    const [code, setCode] = useState('');
    const [focused, setFocused] = useState(false);
    const [busy, setBusy] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendIn, setResendIn] = useState(initialResendIn);
    const [error, setError] = useState<string | null>(initialError ?? null);
    const [notice, setNotice] = useState<string | null>(null);
    const mounted = useRef(true);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => () => { mounted.current = false; }, []);

    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendIn]);

    const submit = async (value = code) => {
        if (busy || value.length !== 6 || !canSubmit) return;
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await onSubmit(value);
        } catch (e) {
            if (!mounted.current) return;
            haptics.notification('error');
            setError(apiErrorMessage(e, "That code didn't work. Try again."));
            setCode('');
            inputRef.current?.focus();
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const changeCode = (text: string) => {
        const digits = text.replace(/\D/g, '').slice(0, 6);
        setCode(digits);
        if (error) setError(null);
        if (autoSubmit && digits.length === 6) submit(digits);
    };

    const resend = async () => {
        if (resendIn > 0 || resending) return;
        setResending(true);
        setError(null);
        setNotice(null);
        try {
            const next = await onResend();
            if (!mounted.current) return;
            setResendIn(next);
            setNotice('A new code is on its way.');
        } catch (e) {
            if (!mounted.current) return;
            const wait = retryAfter(e);
            if (wait) setResendIn(wait);
            setError(apiErrorMessage(e, "We couldn't send a new code. Try again in a minute."));
        } finally {
            if (mounted.current) setResending(false);
        }
    };

    const disabled = busy || code.length !== 6 || !canSubmit;

    return (
        <View>
            <View style={styles.header}>
                <View style={styles.iconWrap}>
                    <MailCheck size={26} color={colors.accent} />
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>
                    {lead} <Text style={styles.strong}>{email}</Text>
                </Text>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Code</Text>
                <View style={[styles.inputContainer, styles.codeContainer, focused && styles.inputFocused, !!error && styles.inputError]}>
                    <TextInput
                        ref={inputRef}
                        value={code}
                        onChangeText={changeCode}
                        placeholder="000000"
                        placeholderTextColor={colors.placeholder}
                        style={styles.codeInput}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                        maxLength={6}
                        autoFocus
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        accessibilityLabel="6-digit code from the email"
                    />
                </View>
            </View>

            {children}

            {!!error && <Text style={[styles.message, { color: colors.danger }]}>{error}</Text>}
            {!!notice && !error && <Text style={[styles.message, { color: colors.accent }]}>{notice}</Text>}

            <TouchableOpacity
                style={[styles.button, disabled && styles.buttonDisabled]}
                onPress={() => submit()}
                activeOpacity={0.8}
                disabled={disabled}
            >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
            </TouchableOpacity>

            <View style={styles.links}>
                <TouchableOpacity onPress={resend} disabled={resendIn > 0 || resending} hitSlop={8}>
                    <Text style={resendIn > 0 || resending ? styles.linkMuted : styles.link}>
                        {resendIn > 0 ? `Send a new code in ${resendIn}s` : resending ? 'Sending…' : 'Send a new code'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onBack} hitSlop={8}>
                    <Text style={styles.linkMuted}>{backLabel}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
