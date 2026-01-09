import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Share,
  Animated,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useRef, useEffect } from 'react';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { TOKENS } from '@/constants/Tokens';

const APP_LOGO = require("@/assets/images/icon.png")

export default function DepositPage() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current; // New slide up animation
  const qrScale = useRef(new Animated.Value(0.9)).current;

  // Get user address
  const { smartWalletPubkey } = useWallet();
  const address = smartWalletPubkey?.toString();

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(qrScale, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleCopy = () => {
    if (address) {
      Clipboard.setString(address);
    };
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My wallet address: ${address}\n\n⚠️ This address accepts SOL and SPL tokens on Devnet only.`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const supportedTokens = [TOKENS.SOL, TOKENS.USDC];

  const styles = StyleSheet.create({
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

  return (
    <LinearGradient
      colors={
        isDark
          ? ['#0A0410', '#1a0a2e', '#0A0410']
          : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
      }
      style={{ flex: 1 }}
    >
      <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"} barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      <View style={styles.container}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.backButtonShadow}>
            <TouchableOpacity
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              onPress={() => router.back()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <BlurView
                intensity={isDark ? 40 : 80}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={isDark ? '#FFF' : '#5B21B6'}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Receive Assets</Text>
        </Animated.View>

        {/* Centered Content */}
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.mainCardShadow,
              { 
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }] 
              },
            ]}
          >
            <View style={styles.contentCard}>
              <BlurView
                intensity={isDark ? 20 : 60} 
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
              />

              {/* QR Code Section */}
              <Animated.View
                style={[
                  styles.qrSection,
                  { transform: [{ scale: qrScale }] },
                ]}
              >
                <View style={styles.qrCodeContainer}>
  {/* 1. Чистий QR-код без логотипу всередині */}
  <QRCode
    value={address || ''}
    size={160}
    backgroundColor="transparent"
    color="#000000"
    ecl="H" // Залишаємо High, щоб QR читався навіть з перекриттям
  />

  {/* 2. Ваше лого поверх QR-коду */}
  <View style={styles.logoWrapper}>
    <Image 
      source={APP_LOGO} 
      style={styles.logoImage} 
      resizeMode="contain" // Важливо: лого не буде обрізатись
    />
  </View>
</View>
                <View style={styles.networkBadge}>
                  <MaterialCommunityIcons
                    name="flask"
                    size={14}
                    color={isDark ? '#FFA500' : '#D2691E'}
                  />
                  <Text style={styles.networkBadgeText}>Devnet Only</Text>
                </View>
              </Animated.View>

              {/* Supported Tokens */}
              <View style={styles.tokensRow}>
                {supportedTokens.map((token) => (
                  <View key={token.symbol} style={styles.tokenItemShadow}>
                    <View style={styles.tokenItem}>
                      <Image
                        source={{ uri: token.logoURL }}
                        style={styles.tokenIcon}
                      />
                      <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Warning */}
              <View style={styles.warningContainer}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={20}
                  color={isDark ? '#C4B5FD' : '#7C3AED'}
                  style={{ marginTop: 0 }}
                />
                <Text style={styles.warningText}>
                  Send only <Text style={{ fontWeight: '700' }}>SOL/SPL</Text> on <Text style={{ fontWeight: '700' }}>Devnet</Text>.
                </Text>
              </View>

              {/* Address (Clickable) */}
              <View style={styles.addressContainerShadow}>
                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.addressContainer}
                  onPress={handleCopy}
                  activeOpacity={0.6}
                >
                  <View style={styles.addressTextContainer}>
                    <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                      {address}
                    </Text>
                    <View style={styles.copyIconContainer}>
                      <MaterialCommunityIcons
                        name="content-copy"
                        size={16}
                        color={isDark ? '#A78BFA' : '#6D28D9'}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Action Button */}
        <Animated.View
          style={[
            styles.buttonContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.buttonShadow}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="share-variant" size={22} color="#FFFFFF" />
              <Text style={styles.buttonText}>Share Address</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}