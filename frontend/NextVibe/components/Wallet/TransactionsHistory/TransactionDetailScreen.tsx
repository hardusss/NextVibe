import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, Animated, StatusBar, Linking, ScrollView } from 'react-native';
import WalletHeader from '@/components/Wallet/Shared/WalletHeader';
import { ArrowLeftRight, Copy, ExternalLink, CheckCircle2 } from 'lucide-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useRef, useCallback, useState } from 'react';
import FastImage from 'react-native-fast-image';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

/**
 * TransactionDetail Screen
 *
 * Displays comprehensive information about a single Solana transaction.
 * Features animated entrance, copy-to-clipboard functionality, blockchain
 * explorer integration, and a rich swap visualisation when the transaction
 * is a token swap (dual-icon header with colour-coded amounts).
 */
export default function TransactionDetailScreen() {
    const { 
        tx_id,               // Transaction signature
        amount,              // Token amount transferred
        direction,           // "sent" | "received" | "swap"
        icon,                // Token logo URL
        timestamp,           // Unix timestamp in milliseconds
        to_address,          // Recipient address or "external"
        from_address,        // Sender address or "external"
        blockchain,          // Token symbol (SOL, USDC, etc.)
        usdValue,            // USD equivalent value
        tx_url,              // Solscan explorer URL
        // Swap-specific params
        swap_input_token,    // Symbol of the sold token
        swap_input_amount,   // Amount of the sold token
        swap_input_logo,     // Logo URL of the sold token
        swap_output_token,   // Symbol of the received token
        swap_output_amount,  // Amount of the received token
        swap_output_logo,    // Logo URL of the received token
    } = useLocalSearchParams();
    
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();
    const isIncoming = direction === 'received';
    const isSwap = direction === 'swap';
    
    // Animation references for smooth entrance effects
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const toastAnimation = useRef(new Animated.Value(0)).current;
    const [toastMessage, setToastMessage] = useState('');

    /**
     * Initialize entrance animations on screen focus.
     * Combines fade-in and slide-up effects for polished UX.
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
     * Displays a temporary toast notification with fade in/out animation.
     * Used for copy confirmation feedback.
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
     * Copies text to clipboard and shows confirmation toast.
     *
     * @param value - Text to copy to clipboard
     * @param label - User-friendly label for toast message
     */
    const handleCopy = (value: string, label: string) => {
        Clipboard.setStringAsync(value);
        showToast(`${label} copied!`);
    };

    /**
     * Formats Unix timestamp to human-readable date string.
     * Handles both second and millisecond precision timestamps.
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
     * Opens blockchain explorer URL in external browser.
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
     * Formats address for display.
     * Returns truncated version for long addresses.
     *
     * @param address - Wallet address or "external"
     * @returns Formatted display string
     */
    const formatAddress = (address: string | string[] | undefined) => {
        if (!address || address === 'external') return 'External Wallet';
        if (typeof address !== 'string') return 'N/A';
        if (address.length > 20) {
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        }
        return address;
    };

    /**
     * Determines if address should be copyable.
     * "external" placeholder addresses should not be copied.
     *
     * @param address - Address to check
     * @returns True if address is a valid copyable string
     */
    const isCopyableAddress = (address: string | string[] | undefined): boolean => {
        return typeof address === 'string' && address !== 'external';
    };

    /**
     * Formats a numeric token amount for display, limiting decimal places
     * based on the magnitude of the number.
     *
     * @param raw - Raw amount (string or number)
     * @returns Formatted amount string
     */
    const formatAmount = (raw: string | string[] | undefined): string => {
        const num = Number(raw);
        if (isNaN(num)) return '0';
        if (num >= 1000) return num.toFixed(0);
        if (num >= 1) return num.toFixed(2);
        return num.toFixed(num < 0.001 ? 6 : 4);
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: 'transparent',
        },
        scrollContainer: {
            padding: 20,
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
            backgroundColor: isSwap
                ? 'rgba(59, 130, 246, 0.15)'
                : isIncoming ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
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
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            textAlign: 'right',
            marginLeft: 8,
        },
        urlText: {
            color: isDark ? '#A78BFA' : '#5856D6',
            fontSize: 14,
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
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
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
            marginLeft: 8,
        },
        // ─── Swap-specific styles ────────────────────────
        swapHeaderContainer: {
            alignItems: 'center',
            marginBottom: 24,
        },
        swapIconsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
        },
        swapTokenIcon: {
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 3,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        },
        swapArrowContainer: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.12)',
            justifyContent: 'center',
            alignItems: 'center',
            marginHorizontal: 12,
        },
        swapAmountsContainer: {
            alignItems: 'center',
            gap: 6,
        },
        swapAmountRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        swapAmountIcon: {
            width: 22,
            height: 22,
            borderRadius: 11,
        },
        swapSentText: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDark ? '#F472B6' : '#DB2777',
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        swapReceivedText: {
            fontSize: 22,
            fontWeight: 'bold',
            color: isDark ? '#34D399' : '#059669',
            fontFamily: "Dank Mono Bold",
            includeFontPadding: false,
        },
        swapDivider: {
            width: 40,
            height: 1,
            backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            marginVertical: 4,
        },
    });

    /**
     * Renders the swap-specific header with dual token icons,
     * a directional arrow, and colour-coded input/output amounts.
     */
    const renderSwapHeader = () => {
        if (!isSwap || !swap_input_token) return null;

        return (
            <Animated.View style={[
                styles.swapHeaderContainer,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}>
                {/* Dual token icons with arrow */}
                <View style={styles.swapIconsRow}>
                    <FastImage
                        source={{ uri: (swap_input_logo as string) || 'https://via.placeholder.com/56' }}
                        style={styles.swapTokenIcon}
                    />
                    <View style={styles.swapArrowContainer}>
                        <ArrowLeftRight
                            size={20}
                            color={isDark ? '#60A5FA' : '#3B82F6'}
                        />
                    </View>
                    <FastImage
                        source={{ uri: (swap_output_logo as string) || 'https://via.placeholder.com/56' }}
                        style={styles.swapTokenIcon}
                    />
                </View>

                {/* Colour-coded amounts */}
                <View style={styles.swapAmountsContainer}>
                    <View style={styles.swapAmountRow}>
                        <FastImage
                            source={{ uri: (swap_input_logo as string) || 'https://via.placeholder.com/22' }}
                            style={styles.swapAmountIcon}
                        />
                        <Text style={styles.swapSentText}>
                            -{formatAmount(swap_input_amount)} {swap_input_token}
                        </Text>
                    </View>
                    <View style={styles.swapDivider} />
                    <View style={styles.swapAmountRow}>
                        <FastImage
                            source={{ uri: (swap_output_logo as string) || 'https://via.placeholder.com/22' }}
                            style={styles.swapAmountIcon}
                        />
                        <Text style={styles.swapReceivedText}>
                            +{formatAmount(swap_output_amount)} {swap_output_token}
                        </Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    /**
     * Renders the standard (non-swap) transaction header
     * with single token icon, amount, and USD value.
     */
    const renderStandardHeader = () => {
        if (isSwap) return null;

        return (
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
        );
    };

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

                <WalletHeader
                    title={isSwap ? 'Swap Details' : 'Transaction Details'}
                    isDark={isDark}
                />

                <ScrollView contentContainerStyle={styles.scrollContainer}>
                    {/* Conditional header: swap vs standard */}
                    {renderSwapHeader()}
                    {renderStandardHeader()}

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

                            {/* Transaction type for swaps */}
                            {isSwap && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.label}>Type</Text>
                                    <View style={styles.valueContainer}>
                                        <ArrowLeftRight
                                            size={16}
                                            color={isDark ? '#60A5FA' : '#3B82F6'}
                                        />
                                        <Text style={[styles.value, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>
                                            Token Swap
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Swap pair info */}
                            {isSwap && swap_input_token && swap_output_token && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.label}>Pair</Text>
                                    <Text style={styles.value}>
                                        {swap_input_token} → {swap_output_token}
                                    </Text>
                                </View>
                            )}

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
                                            <Copy 
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
                            
                            {/* To address - shown for non-swap transactions */}
                            {!isSwap && to_address && (
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
                                            <Copy 
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
                                    <Copy 
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
                                        <ExternalLink 
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
                        <CheckCircle2 size={20} color="#fff" />
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </Animated.View>
                )}
            </View>
        </LinearGradient>
    );
}