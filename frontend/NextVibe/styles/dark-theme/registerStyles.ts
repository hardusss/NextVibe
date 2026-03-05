import { BackHandler, StyleSheet } from 'react-native';


const colors = {
    cardBackground: '#0A0410',
    background: '#0A0410',
    inputBackground: '#0A0410',
    primary: '#A78BFA',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#391b78ff',
    shadow: '#A78BFA',
};

const registerDarkStyles = StyleSheet.create({
    container: {
        backgroundColor: colors.background,
        flex: 1,
        height: 600,
        padding: 20,
        justifyContent: 'center',
    },
    logo: {
        width: 40,
        height: 40,
        marginTop: -50,
        objectFit: "contain"
    },
    title: {
        color: colors.textPrimary,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'left',
        marginBottom: 10,
        marginTop: -30,
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
        padding: 15,
        borderBottomWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
    },
    passwordIcon: {
        position: 'absolute',
        right: 20,
        top: '50%',
        transform: [{ translateY: -12 }],
    },
    privacyPolicy: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
    },
    privacyPolicyText: {
        color: colors.primary,
        textDecorationLine: 'underline',
        fontSize: 14,
    },
    registerButton: {
        backgroundColor: colors.border,
        borderRadius: 10,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 7,
    },
    registerButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: 'bold',
    },
    hrcontainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: "white",
    },
    hrtext: {
        marginHorizontal: 10,
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    googlebutton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: "#fff",
        paddingVertical: 12,
        borderRadius: 8,
    },
    googletext: {
        fontSize: 16,
        color: "black",
        fontWeight: 'bold',
    },
   
    icon: {
        width: 24,
        height: 24,
        marginRight: 10,
        tintColor: 'black',
        objectFit: 'cover',
    },
    googleText: {
        fontSize: 16,
        color: '#ffffff', 
        fontWeight: 'bold',
    },
    bottomText: {
        color: '#fff',
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

export default registerDarkStyles;
