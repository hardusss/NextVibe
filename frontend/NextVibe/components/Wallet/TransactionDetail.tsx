import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Image, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

export default function TransactionDetail() {
  const { 
    tx_id, 
    amount, 
    direction, 
    icon, 
    timestamp, 
    to_address, 
    from_address, 
    blockchain, 
    usdValue, 
    tx_url 
  } = useLocalSearchParams();
  
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const isIncoming = direction === 'incoming';
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useFocusEffect(
    useCallback(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
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

  const formatDate = (timestamp: string | string[]) => {
    if (!timestamp) return '';
    
    const timestampNum = Number(timestamp);
    const timestampMs = timestampNum > 10000000000 ? timestampNum : timestampNum * 1000;
    const date = new Date(timestampMs);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      paddingTop: 10,
    },
    backButton: {
      marginRight: 15,
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: isDark ? '#fff' : '#000',
    },
    card: {
      backgroundColor: isDark ? '#222' : '#f5f5f5',
      borderRadius: 16,
      padding: 20,
      marginVertical: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#eee',
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    statusIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: isIncoming ? '#4CAF50' : '#F44336',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    statusText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isIncoming ? '#4CAF50' : '#F44336',
    },
    amountContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 15,
    },
    amount: {
      color: isDark ? '#fff' : '#000',
      fontSize: 24,
      fontWeight: 'bold',
    },
    tokenIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginLeft: 10,
    },
    usdValue: {
      color: '#666',
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 20,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 10,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : '#eee',
    },
    label: {
      color: isDark ? '#888' : '#666',
      fontSize: 14,
    },
    value: {
      color: isDark ? '#fff' : '#000',
      fontSize: 14,
      fontWeight: '500',
      maxWidth: '60%',
      textAlign: 'right',
    },
    txUrlRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333' : '#eee',
    },
    urlText: {
      color: '#00CED1',
      fontSize: 14,
      maxWidth: '70%',
      textDecorationLine: 'underline',
    },
    button: {
      width: '100%',
      backgroundColor: '#00CED1',
      padding: 16,
      borderRadius: 12,
      marginTop: 20,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar 
        backgroundColor={isDark ? "#000" : "#fff"}
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push("/transactions")}
        >
          <MaterialCommunityIcons 
            name="arrow-left" 
            size={24} 
            color={isDark ? '#fff' : '#000'} 
          />
        </TouchableOpacity>
        <Text style={styles.title}>Transaction Details</Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.statusContainer}>
          <View style={styles.statusIcon}>
            <MaterialCommunityIcons 
              name={isIncoming ? 'arrow-down' : 'arrow-up'} 
              size={24} 
              color="#fff" 
            />
          </View>
          <Text style={styles.statusText}>
            {isIncoming ? 'Received' : 'Sent'}
          </Text>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amount}>
            {isIncoming ? '+' : '-'}{amount} {blockchain.toString().toUpperCase() || 'N/A'}
          </Text>
          <Image 
            source={{ uri: icon as string }} 
            style={styles.tokenIcon}
          />
        </View>
        {usdValue && (
          <Text style={styles.usdValue}>(${usdValue} USD)</Text>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.label}>Status</Text>
          <Text style={[styles.value, { color: '#4CAF50' }]}>Completed</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(timestamp)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>From</Text>
          <Text style={styles.value} numberOfLines={1}>{from_address || '-'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>To</Text>
          <Text style={styles.value} numberOfLines={1}>{to_address}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Transaction ID</Text>
          <Text style={styles.value} numberOfLines={1}>{tx_id}</Text>
        </View>

        {tx_url && (
          <View style={styles.txUrlRow}>
            <Text style={styles.label}>View on Explorer</Text>
            <TouchableOpacity onPress={() => handleOpenURL(tx_url as string)}>
              <Text style={styles.urlText} numberOfLines={1}>
                {tx_url}
              </Text>
            </TouchableOpacity>
          </View>
        )}
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