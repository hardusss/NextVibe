import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;
const BUTTON_HEIGHT = 64;
const BUTTON_WIDTH = SCREEN_WIDTH * 0.88;
const KNOB_WIDTH = 60;

export const BUTTON_CONSTANTS = {
    BUTTON_WIDTH,
    KNOB_WIDTH,
    MAX_SLIDE: BUTTON_WIDTH - KNOB_WIDTH - 8,
};

const createIntroStyles = (isDarkMode: boolean) => StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: SCREEN_WIDTH * 0.06,
        paddingTop: Platform.OS === 'ios' ? (IS_SMALL_DEVICE ? 60 : 80) : 50,
        paddingBottom: IS_SMALL_DEVICE ? 30 : 50,
    },
    topSection: {
        flex: 1,
        alignItems: 'center',
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    iconWrapper: {
        width: 120,
        height: 120,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: isDarkMode ? 'rgba(167, 139, 250, 0.3)' : 'rgba(88, 86, 214, 0.2)',
        shadowColor: isDarkMode ? '#A78BFA' : '#5856D6',
        backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)',
    },
    title: {
        fontSize: 34,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 8,
        color: isDarkMode ? '#FFFFFF' : '#1A1A1A',
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: '80%',
        color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
    },
    listContainer: {
        width: '100%',
        gap: 16,
    },
    featureContainer: {
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    featureBlur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    featureIconBox: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(88, 86, 214, 0.1)',
    },
    featureText: {
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
        color: isDarkMode ? '#E0E0E0' : '#333333',
    },
    bottomSection: {
        width: '100%',
        alignItems: 'center',
    },
    swipeTrack: {
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        borderRadius: BUTTON_HEIGHT / 2,
        borderWidth: 1,
        justifyContent: 'center',
        marginBottom: 20,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    swipeTextContainer: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 20,
        zIndex: 1,
    },
    swipeText: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
    },
    swipeKnob: {
        width: KNOB_WIDTH,
        height: KNOB_WIDTH,
        borderRadius: KNOB_WIDTH / 2,
        position: 'absolute',
        left: 2,
        zIndex: 2,
    },
    knobGradient: {
        flex: 1,
        borderRadius: KNOB_WIDTH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    footerNote: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.8,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 6,
        color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    },
});

export default createIntroStyles;