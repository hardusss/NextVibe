import { Platform, StyleSheet } from 'react-native';

/** The sign-in and sign-up screens' look, for the steps that share it. */
export function authTheme(isDark: boolean) {
    const accent = isDark ? '#A78BFA' : '#7C3AED';
    const colors = {
        accent,
        text: isDark ? '#FFFFFF' : '#000000',
        muted: isDark ? '#888' : '#777',
        placeholder: isDark ? '#666' : '#999',
        icon: isDark ? '#666' : '#999',
        danger: isDark ? '#FF6B6B' : '#FF3B30',
    };

    const styles = StyleSheet.create({
        header: {
            alignItems: 'center',
            marginBottom: 22,
        },
        iconWrap: {
            width: 56,
            height: 56,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
            marginBottom: 14,
        },
        title: {
            fontSize: 22,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            color: colors.text,
            marginBottom: 6,
            letterSpacing: -0.3,
            textAlign: 'center',
        },
        subtitle: {
            fontSize: 14,
            lineHeight: 20,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            color: colors.muted,
            textAlign: 'center',
            paddingHorizontal: 8,
        },
        strong: {
            fontFamily: 'Dank Mono Bold',
            color: colors.text,
        },
        inputGroup: {
            marginBottom: 14,
        },
        label: {
            fontSize: 11,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            color: colors.muted,
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
            borderColor: accent,
            backgroundColor: isDark ? '#150E1F' : '#FFFFFF',
        },
        inputError: {
            borderColor: colors.danger,
        },
        inputIcon: {
            marginRight: 10,
        },
        input: {
            flex: 1,
            height: '100%',
            color: colors.text,
            fontSize: 15,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
        },
        codeContainer: {
            height: 60,
            justifyContent: 'center',
        },
        codeInput: {
            flex: 1,
            height: '100%',
            color: colors.text,
            fontSize: 26,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            letterSpacing: 10,
            textAlign: 'center',
        },
        message: {
            fontSize: 13,
            lineHeight: 18,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            marginTop: -4,
            marginBottom: 12,
            marginLeft: 4,
        },
        button: {
            backgroundColor: accent,
            borderRadius: 14,
            paddingVertical: Platform.OS === 'ios' ? 14 : 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 5,
        },
        buttonDisabled: {
            opacity: 0.5,
        },
        buttonText: {
            color: '#ffffff',
            fontSize: 16,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            letterSpacing: 0.4,
        },
        links: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
            paddingHorizontal: 4,
        },
        link: {
            color: accent,
            fontSize: 14,
            fontFamily: 'Dank Mono Bold',
            includeFontPadding: false,
            paddingVertical: 6,
        },
        linkMuted: {
            color: colors.muted,
            fontSize: 14,
            fontFamily: 'Dank Mono',
            includeFontPadding: false,
            paddingVertical: 6,
        },
    });

    return { colors, styles };
}
