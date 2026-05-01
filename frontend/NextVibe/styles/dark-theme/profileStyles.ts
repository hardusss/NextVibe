import { StyleSheet } from 'react-native';

const colors = {
    background: '#0A0410',
    cardBackground: 'rgba(255,255,255,0.03)',
    cardBorder: 'rgba(168,85,247,0.15)',
    textPrimary: '#e8e0f0',
    textSecondary: '#8b7aab',
    accent: '#a855f7',
};

const profileDarkStyles = StyleSheet.create({
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

export default profileDarkStyles;