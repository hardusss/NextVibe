import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Linking } from 'react-native';
import LottieView from 'lottie-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useRef, useCallback } from 'react';
import FastImage from 'react-native-fast-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

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
        }, [])
    );

    const handleOpenURL = async (url: string) => {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            console.error(`Don't know how to open this URL: ${url}`);
        }
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#0A0410' : '#F5F5F7',
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
        detailsCard: {
            width: '100%',
            backgroundColor: isDark ? '#180F2E' : '#FFFFFF',
            borderRadius: 16,
            padding: 20,
        },
        amountContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        amount: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 32,
            fontWeight: 'bold',
        },
        tokenIcon: {
            width: 32,
            height: 32,
            marginLeft: 12,
        },
        usdValue: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 16,
            textAlign: 'center',
            marginBottom: 20,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#2A1B41' : '#E0E0E0',
        },
        label: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 14,
        },
        value: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 14,
            fontWeight: '500',
            flex: 1,
            textAlign: 'right',
        },
        urlText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontWeight: '600',
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

    return (
        <View style={styles.container}>
            <StatusBar 
                backgroundColor={isDark ? "#0A0410" : "#F5F5F7"}
                barStyle={isDark ? "light-content" : "dark-content"}
            />

            <View style={styles.contentContainer}>
                <View style={styles.lottieContainer}>
                    <LottieView
                        source={require('../../assets/lottie/success.json')}
                        autoPlay
                        loop={false}
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
                <Text style={styles.title}>Transaction Successful!</Text>
                <Text style={styles.subtitle}>Your funds have been sent.</Text>

                <Animated.View style={[ styles.detailsCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.amountContainer}>
                        <Text style={styles.amount}>{amount} {symbol}</Text>
                        <FastImage source={{ uri: icon as string }} style={styles.tokenIcon} />
                    </View>
                    <Text style={styles.usdValue}>Last balance ≈ ${usdValue}</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>From</Text>
                        <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{from}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.label}>To</Text>
                        <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{to}</Text>
                    </View>

                    <TouchableOpacity style={styles.infoRow} onPress={() => handleOpenURL(tx_url as string)}>
                        <Text style={styles.label}>View on Explorer</Text>
                        <MaterialCommunityIcons name="open-in-new" size={18} color={isDark ? '#A78BFA' : '#5856D6'} />
                    </TouchableOpacity>
                </Animated.View>
            </View>

            <TouchableOpacity style={styles.button} onPress={() => router.push("/wallet")}>
                <Text style={styles.buttonText}>Back to Wallet</Text>
            </TouchableOpacity>
        </View>
    );
}
