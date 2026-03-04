import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StatusBar,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Platform,
    useColorScheme,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { WalletOptionCard } from './WalletOptionCard';
import type { WalletType, WalletCardConfig } from './WalletOptionCard';
import useWalletAddress from '@/hooks/useWalletAddress';

const COLORS = {
    dark: {
        textPrimary: '#F0ECFF',
        textSecondary: '#7B6F99',
    },
    light: {
        textPrimary: '#1A0F2E',
        textSecondary: '#6B5C8A',
    },
};

// LazorKit goes first per design requirement
const WALLET_CARDS: WalletCardConfig[] = [
    {
        id: 'lazorkit',
        title: 'Create Seedless Wallet',
        subtitle: 'Powered by LazorKit. No seed phrase needed.',
        ctaLabel: 'Connect with Passkey',
        accent: {
            primary: '#00F5D4',
            secondary: '#00C96A',
            gradientStart: '#04111A',
            gradientEnd: '#061A14',
        },
        featurePills: ['Passkey', 'No seed phrase', 'Gasless'],
    },
    {
        id: 'mwa',
        title: 'Connect Existing Wallet',
        subtitle: 'Via Mobile Wallet Adapter',
        ctaLabel: 'Continue with Wallet',
        accent: {
            primary: '#9945FF',
            secondary: '#6B21D6',
            gradientStart: '#0E0820',
            gradientEnd: '#180E30',
        },
        featurePills: ['Phantom', 'Solflare', 'Backpack'],
    },
];

const WalletSelectionScreen: React.FC = () => {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const colors = isDark ? COLORS.dark : COLORS.light;
    const router = useRouter();
    const { account, connect, disconnect } = useMobileWallet();
    const { connection, address, walletType } = useWalletAddress();
    const bgColors = isDark
        ? (['#0A0410', '#1a0a2e', '#0A0410'] as const)
        : (['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'] as const);

    const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);

    const handleCardPress = useCallback((id: WalletType) => {
        setSelectedWallet((prev) => (prev === id ? null : id));
    }, []);

    const handleMwaConnect = useCallback(async (_id: WalletType) => {
        try {
            if (!account) {
                await connect();
            } else {
                await disconnect();

                await connect();
            }
        } catch (error) {
            console.error("MWA Connection failed:", error);
        }
    }, [account, connect, disconnect]);

    const handleLazorKitConnect = useCallback((_id: WalletType) => { 
        router.push("/wallet-init")
    }, []);

    const handleCtaPress = useCallback(
        (id: WalletType) => {
            if (id === 'mwa') handleMwaConnect(id);
            else handleLazorKitConnect(id);
        },
        [handleMwaConnect, handleLazorKitConnect],
    );

    useEffect(() => {
        if (address) {
            router.push("/wallet-dash");
        }
    }, [address]);

    return (
        <GestureHandlerRootView style={styles.flex}>
            <LinearGradient colors={bgColors} style={styles.flex}>
                <StatusBar
                    barStyle={isDark ? 'light-content' : 'dark-content'}
                    backgroundColor={isDark ? '#0A0410' : '#fafafa'}
                    translucent
                />

                <SafeAreaView style={styles.flex}>
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingTop: Platform.OS === 'android' ? 56 : 0 },
                        ]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Animated.View
                            entering={FadeInDown.delay(100).duration(600).springify()}
                            style={styles.header}
                        >
                            <View style={styles.solanaBadge}>
                                <View style={styles.solanaDot} />
                                <Text style={styles.solanaBadgeText}>Solana Network</Text>
                            </View>

                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                {'Choose Your\nEntry Point'}
                            </Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                                Select how you want to access your on-chain identity.
                            </Text>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInDown.delay(280).duration(600).springify()}
                            style={styles.cardStack}
                        >
                            {WALLET_CARDS.map((cardConfig) => (
                                <WalletOptionCard
                                    key={cardConfig.id}
                                    config={cardConfig}
                                    isExpanded={selectedWallet === cardConfig.id}
                                    isDimmed={selectedWallet !== null && selectedWallet !== cardConfig.id}
                                    onCardPress={handleCardPress}
                                    onCtaPress={handleCtaPress}
                                />
                            ))}
                        </Animated.View>

                    </ScrollView>
                    <Animated.View
                        entering={FadeInDown.delay(440).duration(500)}
                        style={styles.footer}
                    >
                        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                            By continuing you agree to our Terms of Service
                        </Text>
                    </Animated.View>
                </SafeAreaView>
            </LinearGradient>
        </GestureHandlerRootView>
    );
};

export default WalletSelectionScreen;

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 20,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 40,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    headerTitle: {
        fontSize: 32,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        textAlign: 'center',
        lineHeight: 40,
    },
    headerSubtitle: {
        fontSize: 14,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 22,
        letterSpacing: 0.1,
    },
    solanaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 16,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(153, 69, 255, 0.4)',
        backgroundColor: 'rgba(153, 69, 255, 0.08)',
    },
    solanaBadgeText: {
        fontSize: 11,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: '#9945FF',
    },
    solanaDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#9945FF',
    },
    cardStack: {
        gap: 14,
    },
    footer: {
        width: '100%',
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 8 : 16,
        paddingTop: 10,
    },
    footerText: {
        fontSize: 11,
        fontFamily: 'Dank Mono',
        includeFontPadding: false,
        letterSpacing: 0.3,
        opacity: 0.4,
        textAlign: 'center',
    },
});