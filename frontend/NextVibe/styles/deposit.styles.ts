import { StyleSheet, Platform } from "react-native";
import { EdgeInsets } from "react-native-safe-area-context";

const createDepositStyles = (isDark: boolean, insets: EdgeInsets) => StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom + 10,
      paddingHorizontal: 24,
    },
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      zIndex: 10,
    },
    backButtonShadow: {
      shadowColor: isDark ? '#A78BFA' : '#8B5CF6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 5,
    },
    backButton: {
      width: 48, 
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
    },
    title: {
      color: isDark ? '#FFFFFF' : '#1A1A1A',
      fontSize: 22,
      fontWeight: '700',
      marginLeft: 16,
      letterSpacing: -0.5,
      flex: 1,
    },

    content: {
      flex: 1, 
      justifyContent: 'center',
      alignItems: 'center',
      marginVertical: 20,
      marginTop: -15
    },

    // Main Card
    mainCardShadow: {
      width: '100%',
      shadowColor: isDark ? '#A78BFA' : '#8B5CF6',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 10,
    },
    contentCard: {
      width: '100%',
      borderRadius: 32,  
      padding: 24,
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.6)',
    },

    // QR Code Section
    qrSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    qrCodeContainer: {
      backgroundColor: '#FFFFFF',
      padding: 20,
      borderRadius: 26,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative', 
    },
    
    logoWrapper: {
      position: 'absolute', 
      width: 44,            
      height: 44,
      backgroundColor: 'white',
      borderRadius: 10,    
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,            
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },

    logoImage: {
      width: 36,            
      height: 36,
      borderRadius: 18,    
    },
    networkBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 165, 0, 0.1)' : 'rgba(255, 165, 0, 0.15)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginTop: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 165, 0, 0.3)',
    },
    networkBadgeText: {
      color: isDark ? '#FFA500' : '#D2691E',
      fontSize: 13,
      fontWeight: '700',
      marginLeft: 6,
    },

    // Tokens Row
    tokensRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 24,
    },
    tokenItemShadow: {
      shadowColor: isDark ? '#000' : '#8B5CF6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
    },
    tokenItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.6)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255,255,255,0.4)',
      overflow: 'hidden',
    },
    tokenIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      marginRight: 8,
    },
    tokenSymbol: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#333',
    },

    // Warning
    warningContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(167, 139, 250, 0.08)' : 'rgba(88, 86, 214, 0.06)',
      borderRadius: 18,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(167, 139, 250, 0.15)' : 'rgba(88, 86, 214, 0.1)',
    },
    warningText: {
      color: isDark ? '#C4B5FD' : '#5B21B6',
      fontSize: 13,
      marginLeft: 10,
      flex: 1,
      lineHeight: 18,
    },

    // Address
    addressContainerShadow: {
      width: '100%',
    },
    addressContainer: {
      width: '100%',
      backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)',
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.05)',
      overflow: 'hidden',
    },
    addressTextContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    addressText: {
      color: isDark ? '#FFFFFF' : '#1A1A1A',
      fontSize: 13,
      textAlign: 'left',
      flex: 1,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      opacity: 0.9,
    },
    copyIconContainer: {
      marginLeft: 10,
      padding: 6,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },

    // Action Button
    buttonContainer: {
      width: '100%',
      marginBottom: 25,
    },
    buttonShadow: {
      width: '100%',
      shadowColor: isDark ? '#A78BFA' : '#8B5CF6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18, 
      borderRadius: 24,
      overflow: 'hidden',
    },
    primaryButton: {
      backgroundColor: '#8B5CF6', 
    },
    buttonText: {
      fontSize: 17,
      fontWeight: '700',
      marginLeft: 10,
      letterSpacing: 0.5,
      color: '#FFFFFF',
    },
  });
export default createDepositStyles;