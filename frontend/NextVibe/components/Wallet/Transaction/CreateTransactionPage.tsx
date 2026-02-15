import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, useColorScheme, Animated, TouchableOpacity, ScrollView, RefreshControl, Vibration, Keyboard, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Hooks
import useTransaction from '@/hooks/useTransaction'; 
import usePortfolio from '@/hooks/usePortfolio'; 
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { useTransactionForm } from '@/hooks/useTransactionForm'; 

// Components
import { SwipeButton } from './SwipeButton';
import TokenInfoCard from './TokenInfoCard';
import LazorKitShield from './LazorKitShield';

// Styles
import createTransactionStyles from '@/styles/create.transaction.style';

/**
 * Create Transaction Screen
 * Allows users to send crypto assets with a swipe-to-confirm UX.
 * @screen
 */
export default function CreateTransactionScreen() {
    const { symbol } = useLocalSearchParams();
    const isDark = useColorScheme() === 'dark';
    const styles = createTransactionStyles(isDark);
    const router = useRouter();

    // Hooks & Context
    const { sendTransaction } = useTransaction();
    const { data, refresh } = usePortfolio();
    const { smartWalletPubkey } = useWallet();

    // 1. Token Resolution Logic
    const incomingSymbol = Array.isArray(symbol) ? symbol[0] : symbol;
    const liveToken = data.tokens.find(t => t.symbol === incomingSymbol);
    
    // Anti-Flicker: Cache token data to prevent UI jumps during refresh
    const [cachedToken, setCachedToken] = useState(liveToken);
    useEffect(() => { if (liveToken) setCachedToken(liveToken); }, [liveToken]);

    const activeToken = liveToken || cachedToken;
    const tokenSymbolStr = incomingSymbol || activeToken?.symbol || "";
    
    // UI Safe Values
    const currentBalance = activeToken?.amount ?? 0;
    const currentUsdValue = activeToken?.valueUsd ?? 0;
    const tokenName = activeToken?.name ?? tokenSymbolStr; 
    const tokenIcon = activeToken?.logoURI;

    // 2. Form Logic (via Custom Hook) 
    const { 
        recipient, 
        setRecipient, 
        amount, 
        setAmount, 
        handleMax, 
        validate: validateForm, 
        resetForm: clearInputs 
    } = useTransactionForm();

    // 3. UI State
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFailed, setIsFailed] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    // Refs for stability in callbacks
    const recipientRef = useRef(recipient);
    const amountRef = useRef(amount);
    const symbolRef = useRef(tokenSymbolStr);

    // Sync refs with state
    useEffect(() => { recipientRef.current = recipient; }, [recipient]);
    useEffect(() => { amountRef.current = amount; }, [amount]);
    useEffect(() => { if (tokenSymbolStr) symbolRef.current = tokenSymbolStr; }, [tokenSymbolStr]);

    // Keyboard Listeners
    useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSubscription.remove(); hideSubscription.remove(); };
    }, []);

    // 4. Animation Setup
    const errorAnimation = useRef(new Animated.Value(0)).current;

    const showErrorMessage = (message: string) => {
        setErrorMessage(message);
        Animated.sequence([
            Animated.timing(errorAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(3000),
            Animated.timing(errorAnimation, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setErrorMessage(''));
    };

    // Auto-reset failed state after delay
    useFocusEffect(useCallback(() => {
        if (isFailed) {
            const timer = setTimeout(() => { setIsFailed(false); }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isFailed]));

    /** Full reset of the screen state */
    const resetScreen = () => {
        clearInputs();
        setIsSuccess(false);
        setIsLoading(false);
        setIsFailed(false);
    };

    /** Pull-to-refresh handler */
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refresh();
        resetScreen();
        setRefreshing(false);
    }, [refresh]);

    /** * Main Transaction Execution Logic 
     * Triggered by SwipeButton
     */
    const executeTransaction = async () => {
        // 1. Validate Form
        const error = validateForm(currentBalance);
        if (error) {
            setIsFailed(true);
            showErrorMessage(error);
            return;
        }

        const transactionSymbol = symbolRef.current;
        if (!transactionSymbol) {
            setIsFailed(true);
            showErrorMessage('Token symbol error');
            return;
        }

        setIsLoading(true);

        try {
            // 2. Send Transaction
            const txSignature = await sendTransaction(
                recipientRef.current, 
                Number(amountRef.current), 
                transactionSymbol
            );

            // 3. Handle Success
            if (txSignature) {
                setIsSuccess(true);
                Vibration.vibrate(100);
                
                const txData = {
                    from: smartWalletPubkey?.toString() || "Unknown", 
                    to: recipientRef.current, 
                    amount: amountRef.current,
                    symbol: transactionSymbol, 
                    tx_url: `https://solscan.io/tx/${txSignature}?cluster=devnet`
                };

                // Navigate to result after short delay
                setTimeout(() => {
                    resetScreen();
                    router.push({
                        pathname: "/result-transaction",
                        params: txData
                    });
                }, 1000);
            }
        } catch (error: any) {
            // 4. Handle Failure
            setIsFailed(true);
            console.error(error);
            Vibration.vibrate([0, 500]); 
            const msg = error instanceof Error ? error.message : "Transaction failed";
            showErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // 6. Render Data Configuration
    const INPUT_ROWS = [
        {
            label: "Recipient Address",
            value: recipient,
            onChange: setRecipient,
            placeholder: "Paste address (0x...)",
            hasButtonMax: false,
            keyboardType: "default" as const
        },
        {
            label: `Amount ${tokenSymbolStr}`,
            value: amount,
            onChange: setAmount,
            placeholder: "0.00",
            hasButtonMax: true,
            keyboardType: "decimal-pad" as const
        },
    ];

    return (
        <LinearGradient
            colors={isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
            style={{flex: 1}}
        >
            <View style={styles.container}>
                <StatusBar
                    backgroundColor={isDark ? "#0A0410" : "#F5F5F7"}
                    barStyle={isDark ? "light-content" : "dark-content"}
                />
                
                <ScrollView
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#fff" : "#000"} />}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Error Toast */}
                    {errorMessage !== '' && (
                        <Animated.View style={[styles.errorContainer, { opacity: errorAnimation, transform: [{ translateY: errorAnimation.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                            <Text style={styles.errorText}>{errorMessage}</Text>
                        </Animated.View>
                    )}

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.back()}>
                            <MaterialCommunityIcons name="arrow-left" size={28} color={isDark ? '#fff' : '#000'} />
                        </TouchableOpacity>
                        <Text style={styles.title}>Send {tokenSymbolStr}</Text>
                    </View>

                    {/* Token Info Card */}
                    <TokenInfoCard 
                        tokenName={tokenName}
                        tokenSymbol={tokenSymbolStr}
                        tokenIcon={tokenIcon as string}
                        usdValue={currentUsdValue}
                        balance={currentBalance}
                        isDark={isDark}
                    />

                    {/* Input Fields */}
                    {INPUT_ROWS.map((el, index) => (
                        <View key={index} style={styles.inputContainer}>
                            <Text style={styles.label}>{el.label}</Text>
                            <View style={styles.inputWrapper}>
                                <BlurView intensity={isDark ? 30 : 90} tint={isDark ? 'dark' : 'light'} style={styles.blurViewAbsolute} />
                                <TextInput
                                    style={[
                                        styles.input,
                                        el.hasButtonMax && styles.inputWithButton
                                    ]}
                                    value={el.value}
                                    onChangeText={el.onChange}
                                    placeholder={el.placeholder}
                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                    multiline={false}
                                    keyboardType={el.keyboardType}
                                />
                                {el.hasButtonMax && (
                                    <TouchableOpacity style={styles.maxButton} onPress={() => handleMax(currentBalance)}>
                                        <Text style={styles.maxButtonText}>Max</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View> 
                    ))}

                    {/* Lazorkit Security Badge */}
                    <LazorKitShield isDark={isDark}/>
                </ScrollView>

                {/* Swipe Action Button */}
                {!isKeyboardVisible && (
                    <SwipeButton
                        onSwipeSuccess={executeTransaction}
                        isLoading={isLoading}
                        isSuccess={isSuccess}
                        isFailed={isFailed}
                        isDark={isDark}
                    />
                )}
            </View>
        </LinearGradient>
    );
}