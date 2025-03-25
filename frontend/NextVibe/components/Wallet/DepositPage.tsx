import { View, Text, StyleSheet, TouchableOpacity, Image, useColorScheme, Share, Animated } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { useEffect } from 'react';

export default function DepositPage() {
  const { 
    address, 
    icon,
    name, 
    symbol
   }: {
    address: string, 
    icon: string, 
    name: string, 
    symbol: string
  } = useLocalSearchParams();
  const colorScheme = useColorScheme(); 
  const [minimumDep, setMinimumDep] = useState<number>();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [toastVisible, setToastVisible] = useState(false);
  const toastAnimation = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (symbol === 'TRX') {
      setMinimumDep(1);
    } else if (symbol === 'SOL') {
      setMinimumDep(0.000005);
    } else if (symbol === 'BTC') {
      setMinimumDep(0.00000546);
    }
  }, [name])
  
  const showToast = () => {
    setToastVisible((prev) => !prev);
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
      })
    ]).start(() => setToastVisible(false));
  };

  const handleCopy = () => {
    Clipboard.setString(address);
    showToast();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000' : '#fff',
      alignItems: 'center',
      padding: 20,
    },
    qrWrapper: {
      backgroundColor: isDark ? 'black' : '#f0f0f0',
      borderColor: "#00CED1",
      borderWidth: 1,
      width: 290,
      alignItems: 'center',
      padding: 15,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      marginBottom: 20,
    },
    warningText: {
      color: isDark ? '#ccc' : '#555',
      textAlign: 'center',
      marginTop: 15,
      fontSize: 14,
    },
    trx: {
      color: isDark ? 'white' : 'black',
      fontWeight: 'bold',
    },
    minAmount: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'black' : '#f0f0f0',
      borderColor: "#00CED1",
      borderWidth: 1,
      padding: 10,
      marginTop: -17,
      width: 290,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    minAmountText: {
      fontSize: 15,
      color: isDark ? '#fff' : '#333',
    },
    walletTitle: {
      color: isDark ? '#fff' : '#000',
      fontWeight: '600',
      marginBottom: 5,
      fontSize: 16,
    },
    wallet: {
      color: '#00bfff',
      textAlign: 'center',
      marginBottom: 20,
      fontSize: 15,
    },
    buttons: {
      flexDirection: 'row',
      gap: 10,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'black' : '#ddd',
      paddingVertical: 10,
      borderColor: "#00CED1",
      borderWidth: 1,
      paddingHorizontal: 20,
      borderRadius: 8,
      marginHorizontal: 5,
    },
    buttonText: {
      color: '#00CED1',
      fontWeight: '600',
    },
    icon: {
      width: 16,
      height: 16,
      marginHorizontal: 4,
    },
    toast: {
      position: 'absolute',
      bottom: 40,
      backgroundColor: isDark ? '#333' : '#333',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 25,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toastText: {
      color: '#fff',
      fontSize: 14,
    },
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My ${name} wallet address: ${address}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="arrow-left" size={24} color={isDark ? "#fff" : "black"} style={{alignSelf: "flex-start"}} onPress={() => router.push({
              pathname: "/select-token",
              params: {
                from_page: "deposit"
              }
            })} />
      <View style={styles.qrWrapper}>
        <View style={{ backgroundColor: isDark ? '#fff' : '#fff', padding: 10, borderRadius: 16 }}>
          <QRCode
            value={address}
            size={250}
            linearGradient={['#00c6ff', '#0072ff']}
            enableLinearGradient
            backgroundColor="white"
          />
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 300 }}>
          <Text style={styles.warningText}>
            Send only
          </Text>
          <Image source={{ uri: icon }} style={styles.icon} />
          <Text style={styles.trx}> {symbol} </Text>
          <Text style={styles.warningText}>
            through network
          </Text>
          <Image source={{ uri: icon }} style={styles.icon} />
          <Text style={styles.trx}> {name}</Text>
          <Text style={styles.warningText}>otherwise the coins will be lost.</Text>
        </View>
      </View>

      <View style={styles.minAmount}>
        <Text style={styles.minAmountText}>Min. sum: </Text>
        <Text style={[styles.minAmountText, { fontWeight: '600' }]}>{minimumDep} {symbol}</Text>
      </View>

      <Text style={styles.walletTitle}>{symbol}</Text>
      <Text style={styles.wallet}>{address}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#00CED1' }]}
          onPress={handleShare}
        >
          <MaterialCommunityIcons name="share" size={24} color="black" />
          <Text style={[styles.buttonText, {color: "black"}]}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={handleCopy}
        >
          <MaterialCommunityIcons name="content-copy" size={24} color="#00CED1" />
          <Text style={styles.buttonText}>Copy</Text>
        </TouchableOpacity>
      </View>

      {toastVisible && (
        <Animated.View 
          style={[
            styles.toast, 
            {
              opacity: toastAnimation,
              transform: [{
                translateY: toastAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0]
                })
              }]
            }
          ]}
        >
          <MaterialCommunityIcons name="check-circle" size={20} color="#00CED1" />
          <Text style={styles.toastText}>Address copied!</Text>
        </Animated.View>
      )}
    </View>
  );
}
