import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Image, Linking } from 'react-native';
import LottieView from 'lottie-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

export default function ResultTransaction() {
  const { from, to, amount, symbol, usdValue, icon, tx_url } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useFocusEffect(
    useCallback(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        })
      ]).start();
    }, [])
  );

  const handleOpenURL = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000' : '#fff',
      padding: 20,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lottieContainer: {
      width: 300,
      height: 200,
      marginVertical: 20,
    },
    infoContainer: {
      width: '100%',
      backgroundColor: isDark ? '#222' : '#f5f5f5',
      borderRadius: 16,
      padding: 20,
      marginVertical: 20,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 10,
    },
    label: {
      color: isDark ? '#888' : '#666',
      fontSize: 14,
    },
    value: {
      color: isDark ? '#fff' : '#000',
      fontSize: 14,
      fontWeight: '500',
    },
    amountContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 10,
    },
    amount: {
      color: isDark ? '#fff' : '#000',
      fontSize: 24,
      fontWeight: 'bold',
      marginVertical: 10,
    },
    usdValue: {
      color: '#666',
      fontSize: 14,
      textAlign: 'center',
    },
    button: {
      width: '100%',
      backgroundColor: '#00CED1',
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    tokenIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginLeft: 10,
    },
    txUrlRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333' : '#eee',
      cursor: 'pointer',
    },
    urlText: {
      color: '#00CED1',
      fontSize: 14,
      maxWidth: '70%',
      textDecorationLine: 'underline',
    }
  });

  return (
    <View style={styles.container}>
      <StatusBar 
        backgroundColor={isDark ? "#000" : "#fff"}
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      <View style={styles.lottieContainer}>
        <LottieView
          source={require('../../assets/lottie/success.json')}
          autoPlay
          loop={false}
          style={{ width: 300, height: 300 }}
        />
      </View>

      <Animated.View
        style={[
          styles.infoContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.amountContainer}>
          <Text style={styles.amount}>
            {amount} {symbol}
          </Text>
          <Image 
            source={{ uri: icon as string }} 
            style={styles.tokenIcon}
          />
        </View>
        <Text style={styles.usdValue}>Your last balance (${usdValue} USD)</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>From</Text>
          <Text style={styles.value}>{from}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>To</Text>
          <Text style={styles.value}>{to}</Text>
        </View>

        <View style={styles.txUrlRow}>
          <Text style={styles.label}>View on Explorer</Text>
          <TouchableOpacity onPress={() => handleOpenURL(tx_url as string)}>
            <Text style={styles.urlText} numberOfLines={1}>
              {tx_url}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/wallet")}
      >
        <Text style={styles.buttonText}>Back to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}
