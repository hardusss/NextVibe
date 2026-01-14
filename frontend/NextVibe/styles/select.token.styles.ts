import { StyleSheet } from 'react-native';

export const getThemeColors = (isDark: boolean) => ({
    background: 'transparent',
    text: isDark ? '#F1F5F9' : '#1E293B',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
    searchPlaceholder: isDark ? '#64748B' : '#94A3B8',
    skeletonHighlight: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    iconColor: isDark ? '#F1F5F9' : '#1E293B',
});

export const createSelectTokenStyles = (isDark: boolean, colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContentContainer: {
        paddingHorizontal: 16,
        paddingBottom: 30,
    },
    titleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 16,
    },
    backIcon: {
        marginRight: 12,
    },
    title: {
        color: colors.text,
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    searchBoxContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 16,
        marginLeft: 12,
    },
    noTokensText: {
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 32,
        fontSize: 16,
    },
    // Styles for TokenRow component
    tokenItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    tokenItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: "space-between",
        padding: 16,
        width: "100%",
    },
    tokenInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    tokenImage: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 16,
    },
    tokenTextWrapper: {
        justifyContent: 'center',
    },
    tokenName: {
        color: colors.text,
        fontWeight: '700',
        fontSize: 17,
    },
    tokenSymbol: {
        color: colors.textSecondary,
        fontSize: 14,
    },
    arrowIcon: {
        color: colors.textSecondary,
    },
    blurViewAbsolute: {
        ...StyleSheet.absoluteFillObject,
    },
    // Skeleton Styles
    skeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.7)',
        padding: 16,
        borderRadius: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
    },
    skeletonCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.skeletonHighlight,
        marginRight: 16,
    },
    skeletonTextBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    skeletonLineShort: {
        width: 80,
        height: 16,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 8,
        marginBottom: 8,
    },
    skeletonLineLong: {
        width: 120,
        height: 14,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 8,
    },
});