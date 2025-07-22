import { View, Text, StyleSheet, TextInput, useColorScheme, Animated, PanResponder, Dimensions, TouchableOpacity, ScrollView, RefreshControl, Vibration } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useState, useRef, useCallback, useEffect } from 'react';
import { sendSolTransaction, sendBtcTransaction, sendTrxTransaction } from '@/src/api/transactions';
import React from 'react';
import FastImage from 'react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';

const formatValue = (value: any, decimals: number) => {
    const num = Number(value);
    if (isNaN(num)) {
        return '0.00';
    }
    return num.toFixed(decimals);
};

export default function CreateTransactionPage() {
    const { symbol, balance, icon, name, usdt, address } = useLocalSearchParams();
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();

    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFailed, setIsFailed] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const pan = useRef(new Animated.ValueXY()).current;
    const panXValue = useRef(0);
    const textOpacity = useRef(new Animated.Value(1)).current;
    const successScale = useRef(new Animated.Value(0)).current;
    const loadingRotation = useRef(new Animated.Value(0)).current;
    const errorAnimation = useRef(new Animated.Value(0)).current;
    const breathingAnim = useRef(new Animated.Value(1)).current;
    const prevGestureX = useRef(0);
    const lastVibrationTime = useRef(0);

    const screenWidth = Dimensions.get('window').width;
    const SWIPE_AREA_WIDTH = screenWidth - 40;
    const SWIPE_BUTTON_WIDTH = 60;
    const SWIPE_THRESHOLD = SWIPE_AREA_WIDTH * 0.75;

    useEffect(() => {
        const listenerId = pan.x.addListener(c => {
            panXValue.current = c.value;
        });
        return () => {
            pan.x.removeListener(listenerId);
        };
    }, [pan.x]);

    const startBreathingAnimation = () => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(breathingAnim, { toValue: 0.7, duration: 1500, useNativeDriver: true }),
                Animated.timing(breathingAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
            ])
        ).start();
    };

    useFocusEffect(useCallback(() => { startBreathingAnimation(); }, []));

    useFocusEffect(
        useCallback(() => {
            if (isLoading) {
                Animated.loop(
                    Animated.timing(loadingRotation, { toValue: 1, duration: 1000, useNativeDriver: true })
                ).start();
            } else {
                loadingRotation.stopAnimation();
                loadingRotation.setValue(0);
            }
        }, [isLoading])
    );
    
    useFocusEffect(
        useCallback(() => {
            if (isFailed) {
                const timer = setTimeout(() => {
                    setIsFailed(false);
                    resetSwipe();
                }, 2000);
                return () => clearTimeout(timer);
            }
        }, [isFailed])
    );

    const showErrorMessage = (message: string) => {
        setErrorMessage(message);
        Animated.sequence([
            Animated.timing(errorAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(3000),
            Animated.timing(errorAnimation, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setErrorMessage(''));
    };
    
    const resetSwipe = () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    };

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                prevGestureX.current = 0;
                pan.setOffset({ x: panXValue.current, y: 0 });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: (_, gesture) => {
                const now = Date.now();
                const moveDelta = gesture.dx - prevGestureX.current;

                if (gesture.dx > 0 && gesture.dx < SWIPE_AREA_WIDTH - SWIPE_BUTTON_WIDTH) {
                    pan.setValue({ x: gesture.dx, y: 0 });
                    const opacity = 1 - (gesture.dx / (SWIPE_AREA_WIDTH / 2));
                    textOpacity.setValue(Math.max(0, opacity));
                }

                if (now - lastVibrationTime.current > 60) {
                    if (moveDelta > 2) { // Moving right
                        const progress = gesture.dx / SWIPE_AREA_WIDTH;
                        if (progress > 0.2) {
                            let duration = 5;
                            if (progress > 0.8) duration = 25;
                            else if (progress > 0.5) duration = 15;
                            Vibration.vibrate(duration);
                            lastVibrationTime.current = now;
                        }
                    } else if (moveDelta < -2) { // Moving left
                        const progress = gesture.dx / SWIPE_AREA_WIDTH;
                         if (progress > 0.1) {
                            Vibration.vibrate(5);
                            lastVibrationTime.current = now;
                         }
                    }
                }
                prevGestureX.current = gesture.dx;
            },
            onPanResponderRelease: (_, gesture) => {
                pan.flattenOffset();
                if (gesture.dx > SWIPE_THRESHOLD) {
                    Vibration.vibrate(50);
                    handleTransaction();
                } else {
                    resetSwipe();
                }
            },
        })
    ).current;

    const handleTransaction = async () => {
        if (!recipientAddress) {
            showErrorMessage('Please enter recipient address');
            resetSwipe();
            return;
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            showErrorMessage('Please enter valid amount');
            resetSwipe();
            return;
        }
        if (Number(amount) > Number(balance)) {
            showErrorMessage('Insufficient balance');
            resetSwipe();
            return;
        }
        
        await validate("SOL", sendSolTransaction);
        await validate("TRX", sendTrxTransaction);
        await validate("BTC", sendBtcTransaction);
    };

    const validate = async (symbolLocal: string, fetchMethod: (amount: number, address: string) => Promise<any>) => {
        if (symbol === symbolLocal) {
            setIsLoading(true);
            setIsFailed(false);
            try {
                const response = await fetchMethod(Number(amount), recipientAddress);
                if (response.startsWith('https')) {
                    setIsSuccess(true);
                    Vibration.vibrate(100);
                    Animated.spring(successScale, { toValue: 1, useNativeDriver: true }).start();
                    setTimeout(() => {
                        router.push({
                            pathname: "/result-transaction",
                            params: {
                                from: address, to: recipientAddress, amount: amount,
                                symbol: symbol, usdValue: usdt, icon: icon, tx_url: response
                            }
                        });
                    }, 1000);
                } else {
                    throw new Error("Transaction failed");
                }
            } catch (error) {
                setIsFailed(true);
                Vibration.vibrate([0, 500]);
                showErrorMessage("Transaction failed. Please try again.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const resetForm = () => {
        setRecipientAddress('');
        setAmount('');
        setIsSuccess(false);
        successScale.setValue(0);
        resetSwipe();
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        resetForm();
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const handleMaxAmount = () => setAmount(balance as string);
    
    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#F5F5F7',
            paddingHorizontal: 20,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 20,
            paddingBottom: 20,
        },
        title: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 22,
            fontWeight: 'bold',
            marginLeft: 15,
        },
        tokenInfoContainer: {
            backgroundColor: isDark ? '#180F2E' : '#FFFFFF',
            borderRadius: 16,
            padding: 15,
            marginBottom: 24,
        },
        tokenRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        tokenIcon: {
            width: 44,
            height: 44,
            marginRight: 12,
        },
        tokenDetails: {
            flex: 1,
        },
        tokenName: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 18,
            fontWeight: 'bold',
        },
        switchButton: {
            paddingVertical: 4,
        },
        switchButtonText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontWeight: '600',
        },
        balanceContainer: {
            alignItems: 'flex-end',
        },
        balanceText: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 18,
            fontWeight: 'bold',
        },
        tokensAvailable: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 14,
            marginTop: 4,
        },
        inputContainer: {
            marginBottom: 20,
        },
        label: {
            color: isDark ? '#A09CB8' : '#666',
            marginBottom: 8,
            fontSize: 14,
            fontWeight: '500',
        },
        inputWrapper: {
            position: 'relative',
        },
        input: {
            backgroundColor: isDark ? '#180F2E' : '#FFFFFF',
            borderRadius: 12,
            padding: 16,
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 16,
            borderWidth: 1,
            borderColor: isDark ? '#2A1B41' : '#E0E0E0',
        },
        maxButton: {
            position: 'absolute',
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            paddingHorizontal: 10,
        },
        maxButtonText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontWeight: 'bold',
        },
        swipeButtonContainer: {
            position: 'absolute',
            bottom: 30,
            left: 20,
            right: 20,
            height: 64,
            backgroundColor: isDark ? '#180F2E' : '#E0E0E0',
            borderRadius: 32,
            justifyContent: 'center',
            alignItems: 'center',
        },
        swipeText: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 16,
            fontWeight: '600',
        },
        swipeButton: {
            position: 'absolute',
            left: 2,
            top: 2,
            width: SWIPE_BUTTON_WIDTH,
            height: 60,
            borderRadius: 30,
            justifyContent: 'center',
            alignItems: 'center',
        },
        swipeButtonGradient: {
            ...StyleSheet.absoluteFillObject,
            borderRadius: 30,
        },
        errorContainer: {
            position: 'absolute',
            top: 60,
            left: 20,
            right: 20,
            backgroundColor: '#E74C3C',
            padding: 15,
            borderRadius: 12,
            zIndex: 100,
        },
        errorText: {
            color: '#fff',
            fontSize: 14,
            fontWeight: '600',
            textAlign: 'center',
        },
    });

    return (
        <View style={styles.container}>
            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#fff" : "#000"} />}
                contentContainerStyle={{ paddingBottom: 120 }}
                keyboardShouldPersistTaps="handled"
            >
                {errorMessage !== '' && (
                    <Animated.View style={[styles.errorContainer, { opacity: errorAnimation, transform: [{ translateY: errorAnimation.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </Animated.View>
                )}

                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.push("/select-token")}>
                        <MaterialCommunityIcons name="arrow-left" size={28} color={isDark ? '#fff' : '#000'} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Send {symbol}</Text>
                </View>

                <View style={styles.tokenInfoContainer}>
                    <View style={styles.tokenRow}>
                        <FastImage source={{ uri: icon as string }} style={styles.tokenIcon} />
                        <View style={styles.tokenDetails}>
                            <Text style={styles.tokenName}>{name}</Text>
                            <TouchableOpacity style={styles.switchButton} onPress={() => router.push("/select-token")}>
                                <Text style={styles.switchButtonText}>Switch token</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.balanceContainer}>
                            <Text style={styles.balanceText}>${formatValue(usdt, 2)}</Text>
                            <Text style={styles.tokensAvailable}>{formatValue(balance, 5)} {symbol}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Recipient Address</Text>
                    <TextInput style={styles.input} value={recipientAddress} onChangeText={setRecipientAddress} placeholder="Enter address" placeholderTextColor={isDark ? '#666' : '#999'} />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Amount {symbol}</Text>
                    <View style={styles.inputWrapper}>
                        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`0.00`} placeholderTextColor={isDark ? '#666' : '#999'} />
                        <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
                            <Text style={styles.maxButtonText}>Max</Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </ScrollView>

            <View style={styles.swipeButtonContainer}>
                <Animated.Text style={[styles.swipeText, { opacity: isSuccess || isLoading || isFailed ? 0 : textOpacity }]}>
                    Swipe to send
                </Animated.Text>
                <Animated.Text style={[styles.swipeText, { opacity: breathingAnim, position: 'absolute' }]}>
                    {isLoading ? 'Processing...' : isFailed ? 'Failed' : ''}
                </Animated.Text>

                <Animated.View
                    style={[styles.swipeButton, { transform: [{ translateX: pan.x }] }]}
                    {...(!isSuccess && !isLoading && !isFailed && panResponder.panHandlers)}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                    <LinearGradient
                        colors={isDark ? ['#A78BFA', '#5856D6'] : ['#8E8E93', '#BDBDC2']}
                        style={styles.swipeButtonGradient}
                    />
                    <MaterialCommunityIcons name="chevron-double-right" size={30} color="#fff" />
                </Animated.View>
                
                {(isSuccess || isLoading || isFailed) && (
                     <Animated.View style={[StyleSheet.absoluteFill, styles.swipeButtonContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: isSuccess ? '#2ECC71' : isFailed ? '#E74C3C' : 'transparent'}]}>
                        {isLoading && <Animated.View style={{transform: [{rotate: loadingRotation.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})}]}}><MaterialCommunityIcons name="loading" size={32} color="#fff" /></Animated.View>}
                        {isSuccess && <Animated.View style={{transform: [{scale: successScale}]}}><MaterialCommunityIcons name="check" size={32} color="#fff" /></Animated.View>}
                        {isFailed && <MaterialCommunityIcons name="close" size={32} color="#fff" />}
                    </Animated.View>
                )}
            </View>
        </View>
    );
}
