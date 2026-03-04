import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Linking, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useRef, useCallback, useState } from 'react';
import FastImage from 'react-native-fast-image';
import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

/**
 * TransactionDetail Screen
 * Displays comprehensive information about a single Solana transaction
 * Features animated entrance, copy-to-clipboard functionality, and blockchain explorer integration
 */
export default function TransactionDetailScreen() {
    const { 
        tx_id,           // Transaction signature
        amount,          // Token amount transferred
        direction,       // "sent" | "received"
        icon,            // Token logo URL
        timestamp,       // Unix timestamp in milliseconds
        to_address,      // Recipient address or "external"
        from_address,    // Sender address or "external"
        blockchain,      // Token symbol (SOL, USDC, etc.)
        usdValue,        // USD equivalent value
        tx_url           // Solscan explorer URL
    } = useLocalSearchParams();
    
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const isIncoming = direction === 'received';
    
    // Animation references for smooth entrance effects
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const toastAnimation = useRef(new Animated.Value(0)).current;
    const [toastMessage, setToastMessage] = useState('');

    /**
     * Initialize entrance animations on screen focus
     * Combines fade-in and slide-up effects for polished UX
     */
    useFocusEffect(
        useCallback(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 800,
                    delay: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 7,
                    delay: 200,
                    useNativeDriver: true,
                })
            ]).start();
        }, [])
    );

    /**
     * Displays temporary toast notification with fade in/out animation
     * Used for copy confirmation feedback
     * 
     * @param message - Text to display in toast
     */
    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(toastAnimation, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start();
    };

    /**
     * Copies text to clipboard and shows confirmation toast
     * Provides user feedback for successful copy operation
     * 
     * @param value - Text to copy to clipboard
     * @param label - User-friendly label for toast message
     */
    const handleCopy = (value: string, label: string) => {
        Clipboard.setString(value);
        showToast(`${label} copied!`);
    };

    /**
     * Formats Unix timestamp to human-readable date string
     * Handles both second and millisecond precision timestamps
     * 
     * @param ts - Unix timestamp (seconds or milliseconds)
     * @returns Formatted date string or 'N/A' if invalid
     */
    const formatDate = (ts: string | string[] | undefined) => {
        if (!ts) return 'N/A';
        const timestampNum = Number(ts);
        const timestampMs = timestampNum > 10000000000 ? timestampNum : timestampNum * 1000;
        const date = new Date(timestampMs);
        return date.toLocaleString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    /**
     * Opens blockchain explorer URL in external browser
     * Validates URL compatibility before attempting to open
     * 
     * @param url - Solscan or other explorer URL
     */
    const handleOpenURL = async (url: string | string[] | undefined) => {
        if (!url || typeof url !== 'string') return;
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            console.error(`Don't know how to open this URL: ${url}`);
        }
    };

    /**
     * Formats address for display
     * Returns truncated version for "external" addresses or full address
     * 
     * @param address - Wallet address or "external"
     * @returns Formatted display string
     */
    const formatAddress = (address: string | string[] | undefined) => {
        if (!address || address === 'external') return 'External Wallet';
        if (typeof address !== 'string') return 'N/A';
        
        // Show first 4 and last 4 characters for long addresses
        if (address.length > 20) {
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        }
        return address;
    };

    /**
     * Determines if address should be copyable
     * "external" placeholder addresses should not be copied
     * 
     * @param address - Address to check
     * @returns True if address is a valid copyable string
     */
    const isCopyableAddress = (address: string | string[] | undefined): boolean => {
        return typeof address === 'string' && address !== 'external';
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: 'transparent',
        },
        scrollContainer: {
            padding: 20,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 20,
            paddingHorizontal: 20, 
            paddingTop: 20
        },
        backButton: {
            marginRight: 15,
        },
        title: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : '#000',
        },
        statusCard: {
            alignItems: 'center',
            marginBottom: 24,
        },
        statusIconContainer: {
            width: 64,
            height: 64,
            borderRadius: 32,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isIncoming ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
            marginBottom: 16,
        },
        amount: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 36,
            fontWeight: 'bold',
        },
        usdValue: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 16,
            marginTop: 4,
        },
        detailsCard: {
            backgroundColor: 'transparent',
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
        },
        detailsCardContent: {
            padding: 8,
        },
        blurViewAbsolute: {
            ...StyleSheet.absoluteFillObject,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 16,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
        infoRowLast: {
            borderBottomWidth: 0,
        },
        label: {
            color: isDark ? '#A09CB8' : '#666',
            fontSize: 14,
            paddingRight: 15
        },
        valueContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            justifyContent: 'flex-end',
        },
        value: {
            color: isDark ? '#FFFFFF' : '#000',
            fontSize: 14,
            fontWeight: '500',
            textAlign: 'right',
            marginLeft: 8,
        },
        urlText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontWeight: '600',
        },
        toast: {
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: '#2ECC71',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 25,
            flexDirection: 'row',
            alignItems: 'center',
            zIndex: 100,
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
            style={{flex: 1}}
        >
            <View style={styles.container}>
                <StatusBar backgroundColor={isDark ? "#0A0410" : "#fff"}/> 

                {/* Header with back navigation */}
                <View style={styles.header}>
                    <TouchableOpacity 
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                        style={styles.backButton} 
                        onPress={() => router.back()}
                    >
                        <MaterialCommunityIcons 
                            name="arrow-left" 
                            size={28} 
                            color={isDark ? '#FFFFFF' : '#000'} 
                        />
                    </TouchableOpacity>
                    <Text style={styles.title}>Transaction Details</Text>
                </View>
                
                <ScrollView contentContainerStyle={styles.scrollContainer}>
                    {/* Transaction amount card with animated entrance */}
                    <Animated.View style={[
                        styles.statusCard, 
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
                    ]}>
                        <View style={styles.statusIconContainer}>
                            <FastImage 
                                source={{ uri: icon as string }} 
                                style={{width: 44, height: 44, borderRadius: 22}} 
                            />
                        </View>
                        <Text style={styles.amount}>
                            {isIncoming ? '+' : '-'}{parseFloat(Number(amount).toFixed(6)).toString()} {blockchain?.toString().toUpperCase()}
                        </Text>
                        {usdValue && <Text style={styles.usdValue}>${usdValue}</Text>}
                    </Animated.View>

                    {/* Transaction details card with glassmorphism effect */}
                    <Animated.View style={[
                        styles.detailsCard, 
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
                    ]}>
                        <BlurView
                            intensity={isDark ? 30 : 90}
                            tint={isDark ? 'dark' : 'light'}
                            style={styles.blurViewAbsolute}
                        />
                        <View style={styles.detailsCardContent}>
                            {/* Transaction status - always completed for confirmed transactions */}
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>Status</Text>
                                <View style={styles.valueContainer}>
                                    <View style={{
                                        width: 8, 
                                        height: 8, 
                                        borderRadius: 4, 
                                        backgroundColor: '#2ECC71'
                                    }} />
                                    <Text style={[styles.value, { color: '#2ECC71' }]}>
                                        Completed
                                    </Text>
                                </View>
                            </View>

                            {/* Transaction timestamp */}
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>Date</Text>
                                <Text style={styles.value}>{formatDate(timestamp)}</Text>
                            </View>

                            {/* From address - shown only for incoming transactions */}
                            {isIncoming && from_address && (
                                isCopyableAddress(from_address) ? (
                                    <TouchableOpacity 
                                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                                        style={styles.infoRow} 
                                        onPress={() => handleCopy(from_address as string, 'From Address')}
                                    >
                                        <Text style={styles.label}>From</Text>
                                        <View style={styles.valueContainer}>
                                            <Text style={styles.value} numberOfLines={1}>
                                                {from_address}
                                            </Text>
                                            <MaterialCommunityIcons 
                                                name="content-copy" 
                                                size={16} 
                                                color={isDark ? '#A09CB8' : '#666'} 
                                            />
                                        </View>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.label}>From</Text>
                                        <Text style={styles.value}>
                                            {formatAddress(from_address)}
                                        </Text>
                                    </View>
                                )
                            )}
                            
                            {/* To address - always shown */}
                            {to_address && (
                                isCopyableAddress(to_address) ? (
                                    <TouchableOpacity 
                                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                                        style={styles.infoRow} 
                                        onPress={() => handleCopy(to_address as string, 'To Address')}
                                    >
                                        <Text style={styles.label}>To</Text>
                                        <View style={styles.valueContainer}>
                                            <Text style={styles.value} numberOfLines={1}>
                                                {to_address}
                                            </Text>
                                            <MaterialCommunityIcons 
                                                name="content-copy" 
                                                size={16} 
                                                color={isDark ? '#A09CB8' : '#666'} 
                                            />
                                        </View>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.label}>To</Text>
                                        <Text style={styles.value}>
                                            {formatAddress(to_address)}
                                        </Text>
                                    </View>
                                )
                            )}

                            {/* Transaction signature with copy functionality */}
                            <TouchableOpacity 
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                                style={styles.infoRow} 
                                onPress={() => handleCopy(tx_id as string, 'Transaction ID')}
                            >
                                <Text style={styles.label}>Transaction ID</Text>
                                <View style={styles.valueContainer}>
                                    <Text style={styles.value} numberOfLines={1}>
                                        {typeof tx_id === 'string' 
                                            ? `${tx_id.slice(0, 4)}...${tx_id.slice(-4)}`
                                            : tx_id
                                        }
                                    </Text>
                                    <MaterialCommunityIcons 
                                        name="content-copy" 
                                        size={16} 
                                        color={isDark ? '#A09CB8' : '#666'} 
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Blockchain explorer link */}
                            {tx_url && (
                                <TouchableOpacity 
                                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                                    style={[styles.infoRow, styles.infoRowLast]} 
                                    onPress={() => handleOpenURL(tx_url)}
                                >
                                    <Text style={styles.label}>View on Explorer</Text>
                                    <View style={styles.valueContainer}>
                                        <Text style={styles.urlText}>Open Solscan</Text>
                                        <MaterialCommunityIcons 
                                            name="open-in-new" 
                                            size={18} 
                                            color={isDark ? '#A78BFA' : '#5856D6'} 
                                            style={{marginLeft: 4}}
                                        />
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    </Animated.View>
                </ScrollView>

                {/* Toast notification for copy confirmations */}
                {toastMessage !== '' && (
                    <Animated.View style={[
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
                    ]}>
                        <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </Animated.View>
                )}
            </View>
        </LinearGradient>
    );
}