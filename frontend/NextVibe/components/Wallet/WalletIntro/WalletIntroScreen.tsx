import React, { useState, useEffect, useRef } from 'react';
import { View, Text, useColorScheme, AppState } from 'react-native';
import { RelativePathString, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';
import { router } from 'expo-router';

import createIntroStyles from '@/styles/intro.styles';
import HeaderSection from '@/components/Wallet/WalletIntro/HeaderSection';
import FeatureRow from '@/components/Wallet/WalletIntro/FeatureRow';
import SwipeButton from '@/components/Wallet/WalletIntro/SwipeButton';
import saveWallet from '@/src/api/save.wallet';
import Web3Toast from '@/components/Shared/Toasts/Web3Toast';

const CANCELLATION_DETECTION_DELAY = 1500;

export default function WalletIntroScreen() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const styles = createIntroStyles(isDarkMode);

    const { page: rawPage } = useLocalSearchParams();
    const page = rawPage && rawPage !== 'undefined' ? rawPage as string : null;

    const { connect, disconnect } = useWallet();
    const wallet = useWalletStore((s) => s.wallet);

    const [toast, setToast] = useState<{ message: string; isSuccess: boolean } | null>(null);
    const isSaving = useRef(false);

    useEffect(() => {
        const address = wallet?.smartWallet?.toString() ?? null;
        if (!address || isSaving.current) return;

        isSaving.current = true;

        saveWallet(address)
            .then((response) => {
                console.log(response);
                router.replace(page ? `/${page}` as RelativePathString : '/wallet-dash');
            })
            .catch(async (saveError: any) => {
                const msg: string = saveError?.response?.data?.error ?? 'Wallet error';
                await disconnect();
                setToast({ message: msg, isSuccess: false });
            })
            .finally(() => {
                isSaving.current = false;
            });
    }, [wallet?.smartWallet]);

    const handleActivateWallet = async () => {
        if (useWalletStore.getState().isConnecting) {
            await useWalletStore.setState({ isConnecting: false });
        }

        let appStateSubscription: any = null;

        const userCancelRace = new Promise<void>((_, reject) => {
            let returnCount = 0;
            appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
                if (nextAppState === "active") {
                    returnCount++;
                    if (returnCount > 1) {
                        setTimeout(() => {
                            reject(new Error("USER_CANCELLED"));
                        }, CANCELLATION_DETECTION_DELAY);
                    }
                }
            });
        });

        try {
            await Promise.race([
                connect({ redirectUrl: 'nextvibe://wallet-init' }),
                userCancelRace,
            ]);
        } catch (error: any) {
            if (error.message === "USER_CANCELLED") {
                useWalletStore.setState({ isConnecting: false });
                return;
            }
            useWalletStore.setState({ isConnecting: false });
            console.error("Connection Error:", error);
        } finally {
            if (appStateSubscription) {
                appStateSubscription.remove();
            }
        }
    };

    const bgColors = isDarkMode
        ? ['#0A0410', '#1a0a2e', '#0A0410'] as const
        : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'] as const;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient colors={bgColors} style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.topSection}>
                        <HeaderSection isDarkMode={isDarkMode} />
                        <View style={styles.listContainer}>
                            <FeatureRow
                                icon="document-text-outline"
                                text="No Seed Phrase"
                                delay={300}
                                isDarkMode={isDarkMode}
                            />
                            <FeatureRow
                                icon="finger-print-outline"
                                text="Biometric Secured"
                                delay={500}
                                isDarkMode={isDarkMode}
                            />
                            <FeatureRow
                                icon="flash-outline"
                                text="Gasless Transactions"
                                delay={700}
                                isDarkMode={isDarkMode}
                            />
                        </View>
                    </View>

                    <Animated.View
                        entering={FadeInUp.delay(900).springify()}
                        style={styles.bottomSection}
                    >
                        <SwipeButton
                            onTrigger={handleActivateWallet}
                            isDarkMode={isDarkMode}
                        />

                        <View style={styles.footerNote}>
                            <Ionicons
                                name="lock-closed"
                                size={12}
                                color={isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                            />
                            <Text style={styles.footerText}>
                                Powered by LazorKit Security
                            </Text>
                        </View>
                    </Animated.View>
                </View>

                {toast && (
                    <Web3Toast
                        message={toast.message}
                        visible={!!toast}
                        isSuccess={toast.isSuccess}
                        onHide={() => setToast(null)}
                    />
                )}
            </LinearGradient>
        </GestureHandlerRootView>
    );
}