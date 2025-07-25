import { BackHandler, StyleSheet } from 'react-native';


const colors = {
    background: '#0A0410',
    cardBackground: 'white',
    inputBackground: '#0A0410',
    primary: '#58a6ff',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#05f0d8',
    shadow: '#0917b3',
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
        color: colors.border,
        textDecorationLine: 'underline',
        fontSize: 14,
    },
    registerButton: {
        backgroundColor: "#05f0d8",
        borderRadius: 10,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        elevation: 7,
    },
    registerButtonText: {
        color: "black",
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
        backgroundColor: colors.cardBackground,
        paddingVertical: 12,
        borderRadius: 8,
    },
    googletext: {
        fontSize: 16,
        color: "black",
        fontWeight: 'bold',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#232a34',
        paddingVertical: 12,
        paddingHorizontal: 25,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#3a4a5b', 
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 5,
        marginTop: 15,
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
        color: colors.border,
        fontSize: 14,
        textDecorationLine: 'underline',
    },
});

export default registerDarkStyles;
