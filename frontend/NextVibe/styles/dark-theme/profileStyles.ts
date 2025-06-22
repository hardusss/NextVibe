import { StyleSheet } from 'react-native';

const colors = {
    background: '#130E1D', // #09080f
    cardBackground: '#0a0c1a',
    inputBackground: '#0a0c1a',
    primary: '#fafafa',
    secondary: '#1f6feb',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#0b0c2e',
    shadow: '#0917b3',
};

const profileDarkStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: 20,
        overflow: "hidden", 
    },
    username: {
        color: colors.textPrimary,
        fontSize: 28
        },
    avatar: {
        marginLeft: 5,
        width: 100,
        height: 100,
        borderRadius: 60,
        objectFit: "cover"
    },
    text: {
        color: colors.textPrimary,
        textAlign: "center"
    },
    about: {
        color: colors.textPrimary,
        fontWeight: 600,
        marginTop: 20
    }
})

export default profileDarkStyles;