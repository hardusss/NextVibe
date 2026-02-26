import { StyleSheet } from 'react-native';

const colors = {
    background: '#ffffff',
    cardBackground: '#f0f0f0',
    inputBackground: '#eaeaea',
    primary: '#000000',
    secondary: '#1f6feb',
    textPrimary: '#333333',
    textSecondary: '#666666',
    border: '#d1d1d1',
    shadow: '#cccccc',
};

const profileLightStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingLeft: 20,
        paddingRight: 20
    },
    username: {
        color: colors.textPrimary,
        fontSize: 22,
        includeFontPadding: false,
        fontFamily: "Dank Mono Bold"
    },
    avatar: {
        width: 110,
        height: 110,
        borderRadius: 60,
        objectFit: "cover",
        marginLeft: 10,
        
    },
    text: {
        color: colors.textPrimary,
        textAlign: "center",
        includeFontPadding: false,
        fontFamily: "Dank Mono"
    },
    about: {
        color: colors.textPrimary,
        marginTop: 20,
        includeFontPadding: false,
        fontFamily: "Dank Mono"
    }
});

export default profileLightStyles;
