import React from 'react';
import { View, Text, useColorScheme, StatusBar, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';

import createIntroStyles from '@/styles/intro.styles';
import HeaderSection from '@/components/Wallet/WalletIntro/HeaderSection';
import FeatureRow from '@/components/Wallet/WalletIntro/FeatureRow';
import SwipeButton from '@/components/Wallet/WalletIntro/SwipeButton';

/**
 * Deep link scheme for wallet dashboard navigation
 * Used to redirect users back to the app after wallet connection
 */
const APP_SCHEME = 'myapp://wallet-dash';

/**
 * Timeout duration for detecting user cancellation
 * Allows distinction between successful connection and manual browser dismissal
 */
const CANCELLATION_DETECTION_DELAY = 1500;

/**
 * Wallet introduction and onboarding screen
 * 
 * Primary entry point for wallet activation, combining an engaging onboarding
 * experience with sophisticated connection handling. The screen provides:
 * 
 * **Visual Experience:**
 * - Adaptive gradient background (dark/light themes)
 * - Animated shield icon with subtle breathing effect
 * - Staggered entrance animations (300ms intervals)
 * - Blur effects and haptic feedback throughout
 * - Swipe-to-activate gesture interaction
 * 
 * **Feature Showcase:**
 * - No seed phrase management (web3auth integration)
 * - Biometric authentication support
 * - Gasless transaction capability
 * 
 * **Connection Flow:**
 * The wallet connection implements robust error handling:
 * 
 * 1. **Stale State Detection** - Clears any lingering connection states
 * 2. **User Cancellation Tracking** - Monitors AppState to detect manual browser closure
 * 3. **Race Condition Handling** - Balances connection success vs user abort
 * 4. **Automatic Cleanup** - Ensures proper listener removal regardless of outcome
 * 
 * The cancellation detector uses a 1.5s delay after the app becomes active again.
 * This timing distinguishes between:
 * - Successful connection (returns to app immediately)
 * - User cancellation (returns to app after manually closing browser)
 * 
 * @returns Rendered wallet intro screen with full activation flow
 * 
 * @example
 * ```tsx
 * // Route configuration
 * <Stack.Screen 
 *   name="wallet-intro" 
 *   component={WalletIntroScreen}
 *   options={{ headerShown: false }}
 * />
 * ```
 */
export default function WalletIntroScreen() {
    // Theme and styling
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const styles = createIntroStyles(isDarkMode);

    // Wallet connection hook
    const { connect } = useWallet();

    /**
     * Handles wallet activation with comprehensive error handling
     * 
     * **Connection Flow:**
     * 
     * Phase 1 - State Validation:
     * - Checks for stale `isConnecting` flags
     * - Resets connection state if needed
     * 
     * Phase 2 - Cancellation Monitoring:
     * - Sets up AppState listener for browser dismissal detection
     * - Creates race promise that rejects after delay if user returns manually
     * 
     * Phase 3 - Connection Race:
     * - Initiates wallet connection with deep link redirect
     * - Races against user cancellation detector
     * - First promise to resolve/reject wins
     * 
     * Phase 4 - Cleanup:
     * - Removes AppState listener in finally block
     * - Resets connection state on any error
     * 
     * **Error Scenarios:**
     * - `USER_CANCELLED` - User manually closed browser/wallet
     * - Connection errors - Network, wallet adapter, or authentication failures
     * 
     * @throws {Error} USER_CANCELLED - When user manually dismisses wallet browser
     * @throws {Error} Connection errors from wallet adapter
     * 
     * @example
     * ```tsx
     * // Called by SwipeButton on successful swipe
     * await handleActivateWallet();
     * // On success, user is redirected to APP_SCHEME
     * // On error, button resets and error is logged
     * ```
     */
    const handleActivateWallet = async () => {
        // Phase 1: Clear any stale connection state
        if (useWalletStore.getState().isConnecting) {
            console.log("Stale connection detected, resetting...");
            await useWalletStore.setState({ isConnecting: false });
        }

        let appStateSubscription: any = null;

        // Phase 2: Setup user cancellation detector
        const userCancelRace = new Promise<void>((_, reject) => {
            appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
                if (nextAppState === "active") {
                    // Delay distinguishes successful connection from manual dismissal
                    setTimeout(() => {
                        reject(new Error("USER_CANCELLED"));
                    }, CANCELLATION_DETECTION_DELAY);
                }
            });
        });

        try {
            // Phase 3: Race between connection and cancellation
            await Promise.race([
                connect({ redirectUrl: APP_SCHEME }),
                userCancelRace
            ]);

        } catch (error: any) {
            // Handle user cancellation
            if (error.message === "USER_CANCELLED") {
                console.log("User closed browser manually. Force disconnecting.");
                useWalletStore.setState({ isConnecting: false });
                throw error;
            }

            // Handle connection errors
            useWalletStore.setState({ isConnecting: false });
            console.error("Connection Error:", error);
            throw error;

        } finally {
            // Phase 4: Always cleanup the AppState listener
            if (appStateSubscription) {
                appStateSubscription.remove();
            }
        }
    };

    // Gradient colors based on theme
    const bgColors = isDarkMode
        ? ['#0A0410', '#1a0a2e', '#0A0410'] as const
        : ['#FFFFFF', '#dbd4fbff', '#d7cdf2ff'] as const;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient colors={bgColors} style={styles.container}>
                <StatusBar
                    backgroundColor={isDarkMode ? "#0A0410" : "#fff"}
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                />

                <View style={styles.content}>
                    {/* ===== TOP SECTION: Branding & Features ===== */}
                    <View style={styles.topSection}>
                        {/* Animated header with app branding */}
                        <HeaderSection isDarkMode={isDarkMode} />

                        {/* Feature list with staggered animations */}
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

                    {/* ===== BOTTOM SECTION: Activation & Footer ===== */}
                    <Animated.View
                        entering={FadeInUp.delay(900).springify()}
                        style={styles.bottomSection}
                    >
                        {/* Swipe-to-activate button */}
                        <SwipeButton
                            onTrigger={handleActivateWallet}
                            isDarkMode={isDarkMode}
                        />

                        {/* Security provider badge */}
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
            </LinearGradient>
        </GestureHandlerRootView>
    );
}