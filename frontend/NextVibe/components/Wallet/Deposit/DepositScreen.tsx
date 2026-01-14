import {
    View,
    useColorScheme,
    Animated,
    StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useRef, useEffect } from 'react';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { TOKENS } from '@/constants/Tokens';

import QRCodeDisplay from './QRCodeDisplay';
import AddressBox from './AddressBox';
import Header from './Header';
import SupportedTokens from './SupportedTokens';
import WarningBanner from './WarningBanner';
import ShareButton from './ShareButton';

import createDepositStyles from '@/styles/deposit.styles';

/**
 * Token type derived from the TOKENS constant
 */
type Token = typeof TOKENS[keyof typeof TOKENS];

/**
 * Main deposit/receive screen
 * 
 * Provides a complete interface for receiving crypto assets, featuring:
 * - QR code generation for the user's wallet address
 * - Copyable wallet address with one-tap functionality
 * - List of supported tokens (SOL, USDC)
 * - Network warning to prevent incorrect deposits
 * - Native share functionality for address distribution
 * - Smooth entrance animations (fade-in and slide-up)
 * - Adaptive theming based on device color scheme
 * 
 * The screen uses a gradient background with blur effects for a modern,
 * polished appearance. All interactive elements are themed consistently
 * and optimized for both light and dark modes.
 * 
 * @returns Rendered deposit screen with all receive functionality
 * 
 * @example
 * ```tsx
 * // Typically accessed via navigation
 * router.push('/deposit');
 * ```
 */
export default function DepositScreen() {
    const insets = useSafeAreaInsets();
    const isDark = useColorScheme() === 'dark';
    const router = useRouter();

    const styles = createDepositStyles(isDark, insets);

    // Animation references
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    // Wallet integration
    const { smartWalletPubkey } = useWallet();
    const address = smartWalletPubkey?.toString();
    const supportedTokens: Token[] = [TOKENS.SOL, TOKENS.USDC];

    // Entrance animation on mount
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    /**
     * Copies the wallet address to clipboard
     * 
     * Triggered when user taps the address box. Provides silent
     * copy functionality without visual feedback (toast could be added).
     */
    const handleCopy = () => {
        if (address) {
            Clipboard.setString(address);
        }
    };

    return (
        <LinearGradient
            colors={
                isDark
                    ? ['#0A0410', '#1a0a2e', '#0A0410']
                    : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff']
            }
            style={{ flex: 1 }}
        >
            <StatusBar
                backgroundColor={isDark ? "#0A0410" : "#fff"}
                barStyle={isDark ? 'light-content' : 'dark-content'}
            />

            <View style={styles.container}>
                {/* Header with back navigation */}
                <Header
                    title="Receive Assets"
                    isDark={isDark}
                    insets={insets}
                    onBack={() => router.back()}
                />

                {/* Main content area */}
                <View style={styles.content}>
                    <Animated.View
                        style={[
                            styles.mainCardShadow,
                            {
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }],
                            },
                        ]}
                    >
                        <View style={styles.contentCard}>
                            <BlurView
                                intensity={isDark ? 20 : 60}
                                tint={isDark ? 'dark' : 'light'}
                                style={styles.blurViewAbsolute}
                            />

                            {/* QR code for address scanning */}
                            <QRCodeDisplay address={address as string} isDark={isDark} />

                            {/* Token support indicators */}
                            <SupportedTokens
                                tokens={supportedTokens}
                                isDark={isDark}
                                insets={insets}
                            />

                            {/* Network safety warning */}
                            <WarningBanner
                                label="SOL/SPL"
                                network="Devnet"
                                isDark={isDark}
                                insets={insets}
                            />

                            {/* Copyable address display */}
                            <AddressBox
                                address={address as string}
                                isDark={isDark}
                                insets={insets}
                                onCopy={handleCopy}
                            />
                        </View>
                    </Animated.View>
                </View>

                {/* Share address button */}
                <ShareButton
                    address={address as string}
                    isDark={isDark}
                    insets={insets}
                />
            </View>
        </LinearGradient>
    );
};