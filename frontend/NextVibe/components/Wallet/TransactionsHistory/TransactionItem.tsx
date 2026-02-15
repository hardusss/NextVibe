import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import FastImage from 'react-native-fast-image';
import { useRouter } from 'expo-router';

import { FormattedTransaction } from '@/src/types/solana';
import { TOKENS } from '@/constants/Tokens';

type TransactionItemProps = {
    item: FormattedTransaction;
    prices: { [key: string]: number };
    isDark: boolean;
    styles: any;
};

/**
 * Renders a single transaction row with glassmorphism effect
 * * @param props - Component properties
 */
function TransactionItem({ item, prices, isDark, styles }: TransactionItemProps) {
    const router = useRouter();
    const isIncoming = item.type === 'received';
    
    // Helper to resolve token info
    const getTokenInfo = (token: string) => {
        if (token === 'SOL') return TOKENS.SOL;
        if (token === 'USDC') return TOKENS.USDC;
        
        return {
            symbol: token.substring(0, 4) + '...',
            name: 'Unknown Token',
            priceKey: 'solana',
            logoURL: 'https://via.placeholder.com/44'
        };
    };

    const tokenInfo = getTokenInfo(item.token);
    const price = prices[tokenInfo.priceKey] || 0;
    const usdValue = (item.amount * price).toFixed(2);

    const handlePress = () => {
        router.push({
            pathname: "/transaction-detail",
            params: {
                tx_id: item.signature,
                amount: item.amount,
                direction: item.type,
                icon: tokenInfo.logoURL,
                timestamp: item.time?.getTime() || Date.now(),
                to_address: item.to,
                from_address: item.from,
                blockchain: item.token,
                usdValue: usdValue,
                tx_url: `https://solscan.io/tx/${item.signature}?cluster=devnet`
            }
        });
    };

    return (
        <TouchableOpacity 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
            style={styles.transactionItem}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            <BlurView
                intensity={isDark ? 30 : 90}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blurViewAbsolute}
            />
            <View style={styles.transactionItemContent}>
                {/* Icon Section */}
                <View style={styles.transactionIconContainer}>
                    <FastImage 
                        source={{ uri: tokenInfo.logoURL }} 
                        style={styles.tokenIcon} 
                        resizeMode={FastImage.resizeMode.cover}
                    />
                    <View style={[styles.directionIndicator, { 
                        backgroundColor: isIncoming ? '#2ECC71' : '#E74C3C',
                        borderColor: isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                    }]}>
                        <MaterialCommunityIcons 
                            name={isIncoming ? 'arrow-bottom-left' : 'arrow-top-right'} 
                            size={14} 
                            color="#fff" 
                        />
                    </View>
                </View>
                
                {/* Info Section */}
                <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                        {isIncoming ? 'Received' : 'Sent'}
                    </Text>
                    <Text style={styles.transactionAddress} numberOfLines={1} ellipsizeMode="middle">
                        {isIncoming ? `From: ${item.from}` : `To: ${item.to}`}
                    </Text>
                </View>
                
                {/* Amount Section */}
                <View style={styles.transactionDetails}>
                    <Text style={[styles.transactionAmount, { 
                        color: isIncoming ? '#2ECC71' : isDark ? '#FF6B6B' : '#E74C3C'
                    }]}>
                        {isIncoming ? '+' : '-'}
                        {item.amount.toFixed(item.token === 'SOL' ? 4 : 2)} {tokenInfo.symbol}
                    </Text>
                    <Text style={styles.transactionUsdAmount}>
                        $ {usdValue}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

// Memoize to prevent re-renders if props don't change
export default memo(TransactionItem);