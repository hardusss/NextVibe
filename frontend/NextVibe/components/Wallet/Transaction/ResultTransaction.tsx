import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar } from 'react-native';
import LottieView from 'lottie-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import usePortfolio from '@/hooks/usePortfolio';
import { TransactionDetailsCard } from './TransactionDetailsCard';

/**
 * Transaction Result Screen
 * * Displays a success animation and detailed information about a completed transaction.
 * Animates elements into view upon mounting.
 * * @screen
 */
export default function ResultTransaction() {
    // --- 1. Get Params & Data ---
    const params = useLocalSearchParams();
    const { from, to, amount, tx_url } = params;
    
    // Handle potential array format for symbol param
    const symbolStr = Array.isArray(params.symbol) ? params.symbol[0] : params.symbol;

    const { data } = usePortfolio();
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    
    // Memoize styles to prevent recreation on every render
    const styles = useMemo(() => createScreenStyles(isDark), [isDark]);

    // --- 2. Calculate Transaction Metadata ---
    // Find the relevant token to get price and icon
    const tokenInfo = data.tokens.find(t => t.symbol === symbolStr);
    const icon = tokenInfo?.logoURI;
    const price = tokenInfo?.price || 0;
    
    // Calculate value of the transaction at current price
    const transactionValueUsd = (Number(amount) * price).toFixed(2);

    // --- 3. Animations ---
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;

    /**
     * Trigger entry animations when screen gains focus
     */
    useFocusEffect(
        useCallback(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 800,
                    delay: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 7,
                    delay: 300,
                    useNativeDriver: true,
                })
            ]).start();
        }, [fadeAnim, slideAnim])
    );

    return (
        <LinearGradient
            colors={isDark ? ['#0A0410', '#1a0a2e', '#0A0410'] : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']}
            style={{flex: 1}}
        >
            <View style={styles.container}>
                 <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"}/>  

                <View style={styles.contentContainer}>
                    {/* Success Animation */}
                    <View style={styles.lottieContainer}>
                        <LottieView
                            source={require('@/assets/lottie/success.json')}
                            autoPlay
                            loop={false}
                            style={{ width: '100%', height: '100%' }}
                        />
                    </View>
                    
                    <Text style={styles.title}>Transaction Successful!</Text>
                    <Text style={styles.subtitle}>Your funds have been sent.</Text>

                    {/* Animated Details Card */}
                    <Animated.View 
                        style={{ 
                            width: '100%', 
                            opacity: fadeAnim, 
                            transform: [{ translateY: slideAnim }] 
                        }}
                    >
                        <TransactionDetailsCard 
                            amount={amount as string}
                            symbol={symbolStr as string}
                            icon={icon}
                            usdValue={transactionValueUsd}
                            from={from as string}
                            to={to as string}
                            txUrl={tx_url as string}
                            isDark={isDark}
                        />
                    </Animated.View>
                </View>

                {/* Return Button */}
                <TouchableOpacity 
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={styles.button} 
                    onPress={() => router.push("/wallet-dash")}
                >
                    <Text style={styles.buttonText}>Back to Wallet</Text>
                </TouchableOpacity>
            </View>
        </LinearGradient>
    );
}

/**
 * Screen-level styles
 */
const createScreenStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
        padding: 20,
        justifyContent: 'space-between',
    },
    contentContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lottieContainer: {
        width: 200,
        height: 200,
    },
    title: {
        color: isDark ? '#FFFFFF' : '#000',
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 10,
    },
    subtitle: {
        color: isDark ? '#A09CB8' : '#666',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
    },
    button: {
        width: '100%',
        backgroundColor: '#A78BFA',
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});