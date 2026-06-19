import { StyleSheet } from 'react-native';

const colors = {
    background: '#FAFAFC',
    cardBackground: '#ffffff',
    inputBackground: '#f7f6f9',
    primary: '#7c3aed',
    secondary: '#6d28d9',
    textPrimary: '#1a1025',
    textSecondary: '#6b5f7a',
    border: '#ebe8f0',
    shadow: 'rgba(124, 58, 237, 0.08)',
};


const loginLightStyles = StyleSheet.create({
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
        fontFamily: "Dank Mono Bold",
includeFontPadding:false,
        marginBottom: 8,
    },
    input: {
        width: '100%',
        backgroundColor: colors.inputBackground,
        color: colors.textPrimary,
        borderRadius: 10,
        padding: 15,
        borderWidth: 1,
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
        backgroundColor: "#391b78ff",
        borderRadius: 10,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 50,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 7,
    },
    loginButtonText: {
        color: "#ffffff",
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
        backgroundColor: colors.border,
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
        color: colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        marginTop: 20,
    },
    bottomLink: {
        color: colors.primary,
        fontSize: 14,
        textDecorationLine: 'underline',
    },
});

export default loginLightStyles;
