import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import FastImage from 'react-native-fast-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

/**
 * Props for the TransactionDetailsCard component.
 */
interface TransactionDetailsCardProps {
    /** The amount of tokens sent */
    amount: string;
    /** The token symbol (e.g., SOL, USDC) */
    symbol: string;
    /** URL to the token's logo image */
    icon?: string;
    /** Calculated total USD value of the transaction */
    usdValue: string;
    /** Sender's wallet address */
    from: string;
    /** Recipient's wallet address */
    to: string;
    /** URL to the blockchain explorer for this transaction */
    txUrl: string;
    /** Controls the visual theme (dark/light mode) */
    isDark: boolean;
}

/**
 * TransactionDetailsCard Component
 * * A glassmorphic card that displays a summary of the transaction details.
 * Includes amount, value, sender/receiver addresses, and a link to the explorer.
 * * @component
 */
export const TransactionDetailsCard: React.FC<TransactionDetailsCardProps> = ({ 
    amount, 
    symbol, 
    icon, 
    usdValue, 
    from, 
    to, 
    txUrl, 
    isDark 
}) => {
    
    const styles = createStyles(isDark);

    /**
     * Opens the transaction URL in the system browser.
     */
    const handleOpenURL = async (url: string) => {
        if (!url) return;
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) await Linking.openURL(url);
        } catch (error) {
            console.error("Failed to open URL:", error);
        }
    };

    return (
        <View style={styles.detailsCard}>
            <BlurView 
                intensity={isDark ? 30 : 90} 
                tint={isDark ? 'dark' : 'light'} 
                style={StyleSheet.absoluteFill} 
            />
            
            <View style={styles.detailsCardContent}>
                {/* Token & Amount Header */}
                <View style={styles.amountContainer}>
                    <Text style={styles.amount}>{amount} {symbol}</Text>
                    
                    {icon ? (
                        <FastImage 
                            source={{ uri: icon }} 
                            style={styles.tokenIcon} 
                            resizeMode={FastImage.resizeMode.cover}
                        />
                    ) : (
                        <View style={styles.tokenIcon}>
                            <Text style={styles.fallbackIconText}>
                                {symbol ? symbol[0] : '?'}
                            </Text>
                        </View>
                    )}
                </View>
                
                {/* USD Value Estimate */}
                <Text style={styles.usdValue}>Value ≈ ${usdValue}</Text>

                {/* Address Details */}
                <InfoRow label="From" value={from} styles={styles} />
                <InfoRow label="To" value={to} styles={styles} />

                {/* Explorer Link */}
                <TouchableOpacity 
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
                    style={[styles.infoRow, { borderBottomWidth: 0 }]} 
                    onPress={() => handleOpenURL(txUrl)}
                >
                    <Text style={styles.label}>View on Explorer</Text>
                    <MaterialCommunityIcons 
                        name="open-in-new" 
                        size={18} 
                        color={isDark ? '#A78BFA' : '#5856D6'} 
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
};

/**
 * Internal helper component for rendering a label-value row.
 */
const InfoRow = ({ label, value, styles }: { label: string, value: string, styles: any }) => (
    <View style={styles.infoRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
    </View>
);

/**
 * Generates styles based on the current theme.
 * @param isDark - Whether dark mode is active
 */
const createStyles = (isDark: boolean) => StyleSheet.create({
    detailsCard: {
        width: '100%',
        backgroundColor: 'transparent',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(220, 220, 220, 0.5)',
    },
    detailsCardContent: {
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
        borderRadius: 16,
        backgroundColor: isDark ? '#333' : '#ddd',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackIconText: {
        color: '#fff', 
        fontWeight: 'bold', 
        fontSize: 14
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
        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
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
});