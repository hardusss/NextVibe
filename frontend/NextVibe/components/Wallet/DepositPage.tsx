import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Share,
  Animated,
  StatusBar, 
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useState, useCallback, useRef } from 'react';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export default function DepositPage() {
  const {
    address,
    icon,
    name,
    symbol,
  }: {
    address: string,
    icon: string,
    name: string,
    symbol: string,
  } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [minimumDep, setMinimumDep] = useState<number>();
  const [toastVisible, setToastVisible] = useState(false);
  const toastAnimation = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      if (symbol === 'TRX') {
        setMinimumDep(1);
      } else if (symbol === 'SOL') {
        setMinimumDep(0.000005);
      } else if (symbol === 'BTC') {
        setMinimumDep(0.00000546);
      } else if (symbol === 'ETH') {
        setMinimumDep(0.000001);
      }
    }, [symbol]),
  );

  const showToast = (message: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(toastAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastVisible(false));
  };

  const handleCopy = () => {
    Clipboard.setString(address);
    showToast('Address copied!');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My ${name} (${symbol}) wallet address: ${address}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      padding: 20,
    },
    // --- ADDED ---
    blurViewAbsolute: {
      ...StyleSheet.absoluteFillObject,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginBottom: 20,
      marginTop: 20, 
    },
    title: {
      color: isDark ? '#FFFFFF' : '#000',
      fontSize: 22,
      fontWeight: 'bold',
      marginLeft: 15,
    },
    contentCard: {
      backgroundColor: 'transparent',
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      width: '100%',
      overflow: 'hidden', 
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(220, 220, 220, 0.5)',
    },
    qrCodeContainer: {
      backgroundColor: '#FFFFFF',
      padding: 12,
      borderRadius: 16,
      marginBottom: 20,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark
        ? 'rgba(167, 139, 250, 0.1)'
        : 'rgba(88, 86, 214, 0.1)',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 15,
      marginBottom: 20,
    },
    warningText: {
      color: isDark ? '#A78BFA' : '#5856D6',
      fontSize: 13,
      marginLeft: 10,
      flex: 1,
      lineHeight: 18,
    },
    addressContainer: {
      width: '100%',
      backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', 
      borderRadius: 12,
      padding: 15,
      alignItems: 'center',
      marginBottom: 10,
      borderWidth: 1, 
      borderColor: isDark
        ? 'rgba(255, 255, 255, 0.1)'
        : 'rgba(220, 220, 220, 0.4)',
    },
    addressText: {
      color: isDark ? '#FFFFFF' : '#000',
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    minAmountText: {
      color: isDark ? '#A09CB8' : '#666',
      fontSize: 13,
    },
    buttonContainer: {
      flexDirection: 'row',
      marginTop: 20,
      width: '100%',
      justifyContent: 'space-between',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      flex: 1,
    },
    primaryButton: {
      backgroundColor: '#A78BFA',
      marginRight: 10,
    },

    secondaryButton: {
      backgroundColor: 'transparent', 
      overflow: 'hidden', 
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(220, 220, 220, 0.5)',
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
    },
    secondaryButtonText: {
      color: isDark ? '#A78BFA' : '#5856D6',
    },
    toast: {
      position: 'absolute',
      bottom: 40,
      backgroundColor: '#2ECC71',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 25,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
    },
    toastText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 8,
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
      <View style={styles.container}>
        <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"}/>  
        <View style={styles.header}>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={28}
              color={isDark ? '#fff' : 'black'}
            />
          </TouchableOpacity>
          <Text style={styles.title}>Receive {symbol}</Text>
        </View>

        <View style={styles.contentCard}>
          <BlurView
            intensity={isDark ? 30 : 90}
            tint={isDark ? 'dark' : 'light'}
            style={styles.blurViewAbsolute}
          />

          <View style={styles.qrCodeContainer}>
            <QRCode value={address} size={220} backgroundColor="transparent" />
          </View>

          <View style={styles.warningContainer}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={22}
              color={isDark ? '#A78BFA' : '#5856D6'}
            />
            <Text style={styles.warningText}>
              Send only <Text style={{ fontWeight: 'bold' }}>{symbol}</Text> to
              this address. Sending any other coins may result in permanent
              loss.
            </Text>
          </View>

          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={styles.addressContainer}
            onPress={handleCopy}
            activeOpacity={0.8}
          >
            <Text style={styles.addressText}>{address}</Text>
          </TouchableOpacity>

          <Text style={styles.minAmountText}>
            Minimum deposit:{' '}
            <Text style={{ fontWeight: 'bold' }}>
              {minimumDep} {symbol}
            </Text>
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={[styles.button, styles.primaryButton]}
            onPress={handleShare}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" />
            <Text style={[styles.buttonText, styles.primaryButtonText]}>
              Share
            </Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={[styles.button, styles.secondaryButton]}
            onPress={handleCopy}
            activeOpacity={0.8}
          >

            <BlurView
              intensity={isDark ? 30 : 90}
              tint={isDark ? 'dark' : 'light'}
              style={styles.blurViewAbsolute}
            />
            <MaterialCommunityIcons
              name="content-copy"
              size={20}
              color={isDark ? '#A78BFA' : '#5856D6'}
            />
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              Copy
            </Text>
          </TouchableOpacity>
        </View>

        {toastVisible && (
          <Animated.View
            style={[
              styles.toast,
              {
                opacity: toastAnimation,
                transform: [
                  {
                    translateY: toastAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
            <Text style={styles.toastText}>Address copied!</Text>
          </Animated.View>
        )}
      </View>
    </LinearGradient>
  );
}