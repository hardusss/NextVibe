import { StyleSheet, Platform } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Generates styles for the Transaction History screen based on theme and safe area insets.
 * * @param isDark - Current theme mode
 * @param insets - Safe area insets from react-native-safe-area-context
 */
const createTransactionsStyles = (isDark: boolean, insets: EdgeInsets) => StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: insets.top, // Handle status bar automatically
    },
    // List Handling
    listContent: {
        paddingBottom: insets.bottom + 20,
    },
    centeredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 50,
    },
    // Section Headers
    sectionHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#A09CB8' : '#666',
        paddingVertical: 12,
        paddingHorizontal: 4,
        backgroundColor: 'transparent', // Transparent to let gradient show
    },
    // Transaction Item
    transactionItem: {
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
    },
    transactionItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    blurViewAbsolute: {
        ...StyleSheet.absoluteFillObject,
    },
    // Icons & Indicators
    transactionIconContainer: {
        position: 'relative',
        marginRight: 16,
    },
    tokenIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isDark ? '#2C2C2C' : '#E0E0E0',
    },
    directionIndicator: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
    },
    // Text Typography
    transactionInfo: {
        flex: 1,
    },
    transactionType: {
        fontSize: 16,
        fontWeight: '600',
        color: isDark ? '#FFFFFF' : '#000',
        marginBottom: 4,
    },
    transactionAddress: {
        fontSize: 13,
        color: isDark ? '#A09CB8' : '#666',
    },
    transactionDetails: {
        alignItems: 'flex-end',
    },
    transactionAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    transactionUsdAmount: {
        fontSize: 12,
        color: isDark ? '#A09CB8' : '#666',
    },
    // States
    statusText: {
        fontSize: 16,
        color: isDark ? '#A09CB8' : '#666',
        textAlign: 'center',
        marginTop: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#E74C3C',
        textAlign: 'center',
        marginTop: 10,
    },
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});

export default createTransactionsStyles;