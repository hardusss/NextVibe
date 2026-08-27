import React, { useState, useRef, useEffect } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    ViewStyle,
    TextStyle,
    View,
    Text,
    AppState,
    useColorScheme,
    Animated,
    Pressable,
    Platform,
} from 'react-native';
import { Wallet } from 'lucide-react-native';
import LiquidGlassView from '@/components/Shared/LiquidGlassView';
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';
import walletSignIn from '@/src/api/wallet.sign.in';
import saveWallet from '@/src/api/save.wallet';
import { storage } from '@/src/utils/storage';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from '../oauth-components/InviteCodeSheet';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

const CANCELLATION_DETECTION_DELAY = 15000;

interface ButtonLazorKitSignInProps {
    onSuccess: (backendResponse?: any) => void;
    onError?: (error: any) => void;
    buttonStyle?: ViewStyle;
    textStyle?: TextStyle;
    title?: string;
}

/**
 * A sign-in button for iOS that uses LazorKit passkey-based wallet.
 * Connects via LazorKit, saves the wallet, then authenticates the user
 * through the backend wallet-sign-in flow.
 */
export default function ButtonLazorKitSignIn({
    onSuccess,
    onError,
    buttonStyle,
    textStyle,
    title = 'Sign in via Lazorkit Wallet',
}: ButtonLazorKitSignInProps) {
    const isDark = useColorScheme() === 'dark';
    const [isLoading, setIsLoading] = useState(false);
    const isMounted = useRef(true);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingAddressRef = useRef<string | null>(null);
    const scale = useRef(new Animated.Value(1)).current;

    const { connect, disconnect } = useWallet();
    const wallet = useWalletStore((s) => s.wallet);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // When LazorKit wallet is connected, save it and sign in
    useEffect(() => {
        const address = wallet?.smartWallet?.toString() ?? null;
        if (!address || !isLoading) return;

        walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Smart wallet received (${address}), proceeding with sign-in`);
        handleWalletConnected(address);
    }, [wallet?.smartWallet]);

    const animateTo = (value: number) => {
        Animated.spring(scale, {
            toValue: value,
            useNativeDriver: true,
            speed: 40,
            bounciness: 6,
        }).start();
    };

    const handleWalletConnected = async (address: string) => {
        try {
            walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Calling walletSignIn for address: ${address}`);
            const backendResponse = await walletSignIn({
                pubkey: address,
                signature: new Uint8Array(64),
                message: `Sign in to NextVibe via LazorKit.\nAddress: ${address}`,
                username: `vibe_${address.slice(0, 6)}.lzr`,
                isLazorkit: true,
            });

            if (backendResponse?.token) {
                walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Authentication successful! User ID: ${backendResponse.user_id}`);
                await storage.setItem('id', `${backendResponse.user_id}`);
                await storage.setItem('access', backendResponse.token.access);
                await storage.setItem('refresh', backendResponse.token.refresh);

                try {
                    await saveWallet(address);
                    walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: saveWallet succeeded for ${address}`);
                } catch (saveErr) {
                    walletLogger.warn(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Failed to call saveWallet after wallet connection:', saveErr);
                }
            }

            if (!isMounted.current) return;
            setIsLoading(false);
            onSuccess(backendResponse);

        } catch (error: any) {
            if (!isMounted.current) return;
            setIsLoading(false);

            if (error?.response?.data?.error === 'invite_code_required') {
                walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Invite code required for ${address}, opening sheet`);
                pendingAddressRef.current = address;
                sheetRef.current?.present();
                return;
            }

            walletLogger.error(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Sign-In error for ${address}`, error);
            await disconnect();
            onError?.(error);
        }
    };

    const handleConnect = async () => {
        if (isLoading) return;
        setIsLoading(true);
        walletLogger.info(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: handleConnect clicked, starting connection');

        if (useWalletStore.getState().isConnecting) {
            walletLogger.debug(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Clearing existing isConnecting flag');
            await useWalletStore.setState({ isConnecting: false });
        }

        let appStateSubscription: any = null;

        const userCancelRace = new Promise<void>((_, reject) => {
            let returnCount = 0;
            appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
                walletLogger.debug(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: AppState change=${nextAppState}, returnCount=${returnCount}`);
                if (nextAppState === 'active') {
                    returnCount++;
                    if (returnCount > 1) {
                        walletLogger.warn(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Return count > 1. Arming cancellation timeout (${CANCELLATION_DETECTION_DELAY}ms)`);
                        setTimeout(() => {
                            reject(new Error('USER_CANCELLED'));
                        }, CANCELLATION_DETECTION_DELAY);
                    }
                }
            });
        });

        try {
            walletLogger.info(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Calling connect({ redirectUrl: "nextvibe://home" })');
            await Promise.race([
                connect({ redirectUrl: 'nextvibe://home' }),
                userCancelRace,
            ]);
            walletLogger.info(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: LazorKit connect returned successfully');
        } catch (error: any) {
            if (!isMounted.current) return;

            if (error.message === 'USER_CANCELLED') {
                walletLogger.warn(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Connection cancelled by user return timeout');
                useWalletStore.setState({ isConnecting: false });
                setIsLoading(false);
                return;
            }

            useWalletStore.setState({ isConnecting: false });
            setIsLoading(false);
            walletLogger.error(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Connection error during connect', error);
            onError?.(error);
        } finally {
            if (appStateSubscription) {
                appStateSubscription.remove();
            }
        }
    };

    const handleInviteSubmit = async (inviteCode: string) => {
        const address = pendingAddressRef.current;
        if (!address) return;

        walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Submitting invite code registration for ${address}`);
        try {
            const backendResponse = await walletSignIn(
                {
                    pubkey: address,
                    signature: new Uint8Array(64),
                    message: `Sign in to NextVibe via LazorKit.\nAddress: ${address}`,
                    username: `vibe_${address.slice(0, 6)}.lzr`,
                    isLazorkit: true,
                },
                inviteCode
            );

            if (backendResponse?.token) {
                walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Invite sign-in successful! User ID: ${backendResponse.user_id}`);
                await storage.setItem('id', `${backendResponse.user_id}`);
                await storage.setItem('access', backendResponse.token.access);
                await storage.setItem('refresh', backendResponse.token.refresh);

                try {
                    await saveWallet(address);
                    walletLogger.info(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: saveWallet succeeded after invite for ${address}`);
                } catch (saveErr) {
                    walletLogger.warn(WalletTag.LAZORKIT, 'ButtonLazorKitSignIn: Failed to call saveWallet after invite registration:', saveErr);
                }
            }

            pendingAddressRef.current = null;
            sheetRef.current?.dismiss();
            onSuccess(backendResponse);
        } catch (error: any) {
            walletLogger.error(WalletTag.LAZORKIT, `ButtonLazorKitSignIn: Sign-In with Invite Code error for ${address}`, error);
            throw error;
        }
    };

    const ACCENT = '#A78BFA';
    const iconColor = isDark ? ACCENT : '#6D28D9';
    const textColor = isDark ? '#FFFFFF' : '#4C1D95';
    const androidBgColor = isDark ? '#170F24' : '#F3EEFF';
    const androidBorderColor = isDark ? 'rgba(167, 139, 250, 0.4)' : 'rgba(124, 58, 237, 0.3)';

    return (
        <View>
            <Animated.View style={[{ transform: [{ scale }] }, buttonStyle]}>
                <Pressable
                    onPress={handleConnect}
                    onPressIn={() => animateTo(0.96)}
                    onPressOut={() => animateTo(1)}
                    disabled={isLoading}
                    style={({ pressed }) => [
                        styles.button,
                        Platform.OS !== 'ios' && {
                            backgroundColor: androidBgColor,
                            borderColor: androidBorderColor,
                        },
                        { opacity: pressed ? 0.88 : 1 },
                    ]}
                >
                    {Platform.OS === 'ios' && (
                        <LiquidGlassView
                            style={StyleSheet.absoluteFill}
                            glassEffectStyle="regular"
                            colorScheme={isDark ? 'dark' : 'light'}
                            tintColor={isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.1)'}
                            isInteractive
                            fallbackBackgroundColor={androidBgColor}
                        />
                    )}
                    {isLoading ? (
                        <ActivityIndicator size="small" color={iconColor} />
                    ) : (
                        <View style={styles.content}>
                            <View style={styles.iconWrap}>
                                <Wallet size={19} color={iconColor} />
                            </View>
                            <Text style={[styles.buttonText, { color: textColor }, textStyle]}>
                                {title}
                            </Text>
                        </View>
                    )}
                </Pressable>
            </Animated.View>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </View>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 52,
        borderRadius: 14,
        borderWidth: Platform.OS === 'ios' ? 0 : 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#A78BFA',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrap: {
        marginRight: 10,
    },
    buttonText: {
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.3,
    },
});