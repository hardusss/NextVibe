import { StyleSheet } from 'react-native';

const colors = {
    cardBackground: '#0a0c1a',
    background: '#0A0410',
    inputBackground: '#0A0410',
    primary: '#58a6ff',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#05f0d8',
    shadow: '#0917b3',
};

const loginDarkStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        padding: 20,
        justifyContent: 'center',
    },
    logo: {
        width: 40,
        height: 40,
        alignSelf: 'center',
        marginBottom: 30,
        objectFit: "contain"
    },
    title: {
        color: colors.textPrimary,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
    },
    inputLabel: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        width: '100%',
        backgroundColor: colors.inputBackground,
        color: colors.textPrimary,
        padding: 15,
        borderBottomWidth: 1,
        borderColor: colors.border,
        marginBottom: 5,
    },
    passwordIcon: {
        position: 'absolute',
        right: 20,
        top: '50%',
        transform: [{ translateY: -15 }],
    },
    loginButton: {
        backgroundColor: colors.border,
        borderRadius: 10,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 50,
        elevation: 7,
    },
    loginButtonText: {
        color: "black",
        fontSize: 16,
        fontWeight: 'bold',
    },
    forgotPassword: {
        color: colors.primary,
        fontSize: 14,
        textDecorationLine: 'underline',
        textAlign: 'right',
        marginTop: 10,
    },
    hrcontainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: colors.textSecondary,
    },
    hrtext: {
        marginHorizontal: 10,
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.cardBackground,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 10,
    },
    googleText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    bottomText: {
        color: colors.textPrimary,
        fontSize: 14,
        textAlign: 'center',
        marginTop: 20,
    },
    bottomLink: {
        color: colors.border,
        fontSize: 14,
        textDecorationLine: 'underline',
    },
});

export default loginDarkStyles;