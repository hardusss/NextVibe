import { View, Text, StyleSheet, TextInput, useColorScheme, Animated, PanResponder, Dimensions, Image, TouchableOpacity, ScrollView, RefreshControl, Vibration } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useState, useRef, useCallback } from 'react';
import { sendSolTransaction, sendBtcTransaction, sendTrxTransaction } from '@/src/api/transactions';
import React from 'react';
import FastImage from 'react-native-fast-image';


export default function CreateTransactionPage() {
  const { symbol, balance, icon, name, usdt, address } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const [errorMessage, setErrorMessage] = useState('');
  const errorAnimation = useRef(new Animated.Value(0)).current;
  
  const toastAnimation = useRef(new Animated.Value(0)).current;
  const [toastVisible, setToastVisible] = useState(false);

  const buttonPosition = useRef(new Animated.Value(0)).current;
  const backgroundWidth = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const buttonWidth = screenWidth - 40; 
  const [refreshing, setRefreshing] = useState(false);

  const [showCommentInput, setShowCommentInput] = useState(false);
  const [comment, setComment] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const loadingRotation = useRef(new Animated.Value(0)).current;
  const [isFailed, setIsFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isLoading) {
        Animated.loop(
          Animated.timing(loadingRotation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          })
        ).start();
      } else {
        loadingRotation.setValue(0);
      }
    }, [isLoading])
  );

  useFocusEffect(
    useCallback(() => {
      if (isFailed) {
        const timer = setTimeout(() => {
          setIsFailed(false);
          setIsError(false); 
        }, 1000);
        return () => clearTimeout(timer);
      }
    }, [isFailed])
  );

  const resetForm = () => {
    setRecipientAddress('');
    setAmount('');
    setError('');
    setErrorMessage('');
    setIsSuccess(false);
    setShowCommentInput(false);
    setComment('');
    successScale.setValue(0);
    buttonPosition.setValue(0);
    backgroundWidth.setValue(0);
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    resetForm();
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const showError = (message: string) => {
    setError(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(toastAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => setToastVisible(false));
  };

  const showErrorMessage = (message: string) => {
    setErrorMessage(message);
    Animated.sequence([
      Animated.spring(errorAnimation, {
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.spring(errorAnimation, {
        toValue: 0,
        useNativeDriver: true,
      })
    ]).start(() => setErrorMessage(''));
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      if (gesture.dx > 0 && gesture.dx <= buttonWidth - 60) { 
        buttonPosition.setValue(gesture.dx);
        const progress = gesture.dx / (buttonWidth - 60);
        backgroundWidth.setValue(progress * buttonWidth);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx >= buttonWidth - 100) { 
        handleTransaction();
      }
      Animated.parallel([
        Animated.spring(buttonPosition, {
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.spring(backgroundWidth, {
          toValue: 0,
          useNativeDriver: false,
        })
      ]).start();
    },
  });

  const handleTransaction = async () => {
    if (!recipientAddress) {
      showErrorMessage('Please enter recipient address');
      return;
    }
    if (!amount || isNaN(Number(amount))) {
      showErrorMessage('Please enter valid amount');
      return;
    }
    if (Number(amount) > Number(balance)) {
      showErrorMessage('Insufficient balance');
      return;
    }
    
    await validate("SOL", sendSolTransaction);
    await validate("TRX", sendTrxTransaction);
    await validate("BTC", sendBtcTransaction);
    
  };

  const validate = async (symbolLocal: string, fetchMethod: (amount: number, address: string) => Promise<any>) => {
    if (symbol === symbolLocal) {
      setIsLoading(true);
      setIsError(false);
      setIsFailed(false);
      try {
        const response = await fetchMethod(Number(amount), recipientAddress);
        console.log(response);
        if (response.startsWith('https')) {
          setIsSuccess(true);
          Vibration.vibrate([0, 100, 100, 100]); // Success vibration pattern
          
          Animated.spring(successScale, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
          
          setTimeout(() => {
            router.push({
              pathname: "/result-transaction",
              params: {
                from: address,
                to: recipientAddress,
                amount: amount,
                symbol: symbol,
                usdValue: usdt,
                icon: icon,
                tx_url: response
              }
            });
          }, 1000);
        } else {
          setIsError(true);
          setIsFailed(true);
          Vibration.vibrate([0, 500]); 
          showErrorMessage("Transaction failed");
        } 
      } catch (error) {
        setIsError(true);
        setIsFailed(true);
        Vibration.vibrate([0, 500]);
        showErrorMessage("Transaction failed");
      } finally {
        setIsLoading(false);
      }
    }
  }

  const handleMaxAmount = () => {
    setAmount(balance as string);
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
      marginBottom: 30,
    },
    title: {
      color: isDark ? '#fff' : '#000',
      fontSize: 20,
      fontWeight: 'bold',
      marginLeft: 15,
    },
    inputContainer: {
      marginBottom: 20,
    },
    label: {
      color: isDark ? '#ccc' : '#666',
      marginBottom: 8,
      fontSize: 14,
    },
    input: {
      backgroundColor: isDark ? '#000' : '#fff',
      borderRadius: 12,
      padding: 15,
      color: isDark ? '#fff' : '#000',
      borderWidth: 1,
      borderColor: '#00CED1',
    },
    swipeButtonContainer: {
      position: 'absolute',
      bottom: 30,
      left: 20,
      right: 20,
      height: 60,
      backgroundColor: isDark ? '#000' : '#000',
      borderRadius: 12,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#00CED1',
      overflow: 'hidden',
    },
    swipeBackground: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: isSuccess ? '#4CAF50' : '#00CED1',
    },
    swipeButton: {
      width: 50,
      height: 50,
      backgroundColor: isError ? '#ff4444' : isSuccess ? '#4CAF50' : '#00CED1',
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'absolute',
      left: 5,
    },
    swipeText: {
      color: '#fff',
      textAlign: 'center',
      fontSize: 16,
      fontWeight: 'bold',
    },
    toast: {
      position: 'absolute',
      bottom: 100,
      left: 20,
      right: 20,
      backgroundColor: error.includes('success') ? '#4CAF50' : '#ff4444',
      padding: 15,
      borderRadius: 25,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    toastText: {
      color: '#fff',
      marginLeft: 10,
    },
    tokenInfoContainer: {
      backgroundColor: isDark ? '#222' : '#f5f5f5',
      borderRadius: 12,
      padding: 15,
      marginBottom: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    tokenLeftSection: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 10,
    },
    tokenTextContainer: {
      justifyContent: 'center',
    },
    tokenName: {
      color: isDark ? '#fff' : '#000',
      fontSize: 16,
      fontWeight: 'bold',
    },
    switchButton: {
      marginTop: 5,
      backgroundColor: '#00CED1',
      padding: 5,
      borderRadius: 8,
    },
    switchButtonText: {
      color: '#fff',
      fontSize: 12,
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceText: {
      color: isDark ? '#fff' : '#000',
      fontSize: 16,
    },
    tokensAvailable: {
      color: '#666',
      fontSize: 12,
      marginTop: 5,
    },
    amountContainer: {
      position: 'relative',
    },
    maxButton: {
      position: 'absolute',
      right: 10,
      top: 12,
      backgroundColor: '#00CED1',
      padding: 5,
      borderRadius: 8,
    },
    maxButtonText: {
      color: '#fff',
      fontSize: 12,
    },
    errorContainer: {
      zIndex: 9999,
      position: 'absolute',
      top: 20,
      left: 20,
      right: 20,
      backgroundColor: '#ff4444',
      padding: 15,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    errorText: {
      color: '#fff',
      marginLeft: 10,
      fontSize: 14,
      flex: 1,
    },
    addCommentText: {
      color: '#00CED1',
      textDecorationLine: 'underline',
      marginTop: 10,
      marginBottom: 10,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? "#fff" : "#000"}
            colors={["#00CED1"]}
            progressBackgroundColor={isDark ? "#000" : "#fff"}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {errorMessage !== '' && (
          <Animated.View 
            style={[
              styles.errorContainer,
              {
                opacity: errorAnimation,
                transform: [{
                  translateY: errorAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0]
                  })
                }]
              }
            ]}
          >
            <MaterialCommunityIcons name="alert-circle" size={24} color="#fff" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </Animated.View>
        )}

        <View style={styles.header}>
          <MaterialCommunityIcons 
            name="arrow-left" 
            size={24} 
            color={isDark ? '#fff' : '#000'} 
            onPress={() => router.push("/select-token")} 
          />
          <Text style={styles.title}>Send {symbol}</Text>
        </View>

        <View style={styles.tokenInfoContainer}>
          <View style={styles.tokenLeftSection}>
            <FastImage source={{ uri: icon as string }} style={styles.tokenIcon} />
            <View style={styles.tokenTextContainer}>
              <Text style={styles.tokenName}>{name}</Text>
              <TouchableOpacity 
                style={styles.switchButton}
                onPress={() => router.push("/select-token")}
              >
                <Text style={styles.switchButtonText}>Switch token</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceText}>${usdt}</Text>
            <Text style={styles.tokensAvailable}>{balance} {symbol}</Text>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Recipient Address</Text>
          <TextInput
            style={styles.input}
            value={recipientAddress}
            onChangeText={setRecipientAddress}
            placeholder="Enter address"
            placeholderTextColor={isDark ? '#666' : '#999'}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Amount {symbol}</Text>
          <View style={styles.amountContainer}>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={`Enter amount in ${symbol}`}
              placeholderTextColor={isDark ? '#666' : '#999'}
            />
            <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
              <Text style={styles.maxButtonText}>Max</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!showCommentInput ? (
          <TouchableOpacity onPress={() => setShowCommentInput(true)}>
            <Text style={styles.addCommentText}>Add comment to transaction</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Transaction Comment</Text>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder="Enter comment"
              placeholderTextColor={isDark ? '#666' : '#999'}
              multiline
            />
          </View>
        )}

      </ScrollView>

      <View style={styles.swipeButtonContainer}>
        <Animated.View 
          style={[
            styles.swipeBackground,
            {
              width: isSuccess ? '100%' : backgroundWidth,
              backgroundColor: isFailed ? '#ff4444' : isSuccess ? '#4CAF50' : '#00CED1',
            }
          ]} 
        />
        <Animated.View 
          {...(!isSuccess && !isLoading && panResponder.panHandlers)}
          style={[
            styles.swipeButton,
            {
              transform: isSuccess 
                ? [{ scale: successScale }]
                : isLoading 
                ? [{ 
                    rotate: loadingRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }]
                : [{ translateX: buttonPosition }],
              left: isSuccess || isError ? '45%' : 5,
              backgroundColor: isFailed ? '#ff4444' : isSuccess ? '#4CAF50' : '#00CED1',
            }
          ]}
        >
          <MaterialCommunityIcons 
            name={
              isSuccess ? "check" 
              : isError ? "close" 
              : isLoading ? "loading" 
              : "arrow-right"
            } 
            size={24} 
            color="#fff" 
          />
        </Animated.View>
        <Text style={styles.swipeText}>
          {isSuccess ? '' 
           : isError ? 'Failed' 
           : isLoading ? 'Processing...' 
           : 'Swipe to send'}
        </Text>
      </View>

    </View>
  );
}
