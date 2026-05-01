import { StyleSheet } from 'react-native';

const colors = {
    background: '#ffffff',
    cardBackground: 'rgba(0,0,0,0.02)',
    cardBorder: 'rgba(168,85,247,0.12)',
    textPrimary: '#1a1025',
    textSecondary: '#6b5f7a',
    accent: '#a855f7',
};

const profileLightStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        overflow: "hidden",
    },
    username: {
        color: colors.textPrimary,
        fontSize: 22,
        includeFontPadding: false,
        fontFamily: "Dank Mono Bold",
    },
    text: {
        color: colors.textPrimary,
        textAlign: "center",
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
    about: {
        color: colors.textSecondary,
        fontSize: 13,
        lineHeight: 20,
        textAlign: "center",
        fontFamily: "Dank Mono",
        includeFontPadding: false,
    },
});

export default profileLightStyles;
