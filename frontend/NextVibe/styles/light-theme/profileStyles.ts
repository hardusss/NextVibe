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
        fontSize: 36
    },
    avatar: {
        width: 110,
        height: 110,
        borderRadius: 60,
        objectFit: "cover"
    },
    text: {
        color: colors.textPrimary,
        textAlign: "center"
    },
    about: {
        color: colors.textPrimary,
        fontWeight: "600",
        marginTop: 20
    }
});

export default profileLightStyles;
