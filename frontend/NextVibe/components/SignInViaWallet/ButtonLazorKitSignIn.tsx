import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View, AppState } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';
import walletSignIn from '@/src/api/wallet.sign.in';
import saveWallet from '@/src/api/save.wallet';
import { storage } from '@/src/utils/storage';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from '../oauth-components/InviteCodeSheet';

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
    title = "Sign in Via Passkey"
}: ButtonLazorKitSignInProps) {
    const [isLoading, setIsLoading] = useState(false);
    const isMounted = useRef(true);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingAddressRef = useRef<string | null>(null);

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

        handleWalletConnected(address);
    }, [wallet?.smartWallet]);

    const handleWalletConnected = async (address: string) => {
        try {
            // First save the wallet
            await saveWallet(address);

            // Then sign in — LazorKit doesn't support signMessage,
            // so we authenticate via wallet address only
            const backendResponse = await walletSignIn({
                pubkey: address,
                signature: new Uint8Array(64), // LazorKit uses passkey auth, no ed25519 signature
                message: `Sign in to NextVibe via LazorKit.\nAddress: ${address}`,
                username: `vibe_${address.slice(0, 6)}.lzr`,
            });

            if (backendResponse?.token) {
                await storage.setItem("id", `${backendResponse.user_id}`);
                await storage.setItem("access", backendResponse.token.access);
                await storage.setItem("refresh", backendResponse.token.refresh);
            }

            if (!isMounted.current) return;
            setIsLoading(false);
            onSuccess(backendResponse);

        } catch (error: any) {
            if (!isMounted.current) return;
            setIsLoading(false);

            if (error?.response?.data?.error === 'invite_code_required') {
                pendingAddressRef.current = address;
                sheetRef.current?.present();
                return;
            }

            console.error("LazorKit Sign-In Error:", error);
            await disconnect();
            onError?.(error);
        }
    };

    const handleConnect = async () => {
        if (isLoading) return;
        setIsLoading(true);

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
                connect({ redirectUrl: 'nextvibe://home' }),
                userCancelRace,
            ]);
        } catch (error: any) {
            if (!isMounted.current) return;

            if (error.message === "USER_CANCELLED") {
                useWalletStore.setState({ isConnecting: false });
                setIsLoading(false);
                return;
            }

            useWalletStore.setState({ isConnecting: false });
            setIsLoading(false);
            console.error("LazorKit Connection Error:", error);
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

        try {
            const backendResponse = await walletSignIn(
                {
                    pubkey: address,
                    signature: new Uint8Array(64),
                    message: `Sign in to NextVibe via LazorKit.\nAddress: ${address}`,
                    username: `vibe_${address.slice(0, 6)}.lzr`,
                },
                inviteCode
            );

            if (backendResponse?.token) {
                await storage.setItem("id", `${backendResponse.user_id}`);
                await storage.setItem("access", backendResponse.token.access);
                await storage.setItem("refresh", backendResponse.token.refresh);
            }

            pendingAddressRef.current = null;
            sheetRef.current?.dismiss();
            onSuccess(backendResponse);
        } catch (error: any) {
            console.error("LazorKit Sign-In Error (Invite Code):", error);
            throw error;
        }
    };

    return (
        <View>
            <TouchableOpacity
                style={[styles.buttonContainer, buttonStyle]}
                onPress={handleConnect}
                disabled={isLoading}
                activeOpacity={0.8}
            >
                {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <>
                        <KeyRound size={20} color="#FFFFFF" style={styles.icon} />
                        <Text style={[styles.buttonText, textStyle]}>
                            {title}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </View>
    );
}

const styles = StyleSheet.create({
    buttonContainer: {
        backgroundColor: '#0A0410',
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#00F5D4',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: 56,
        shadowColor: '#00F5D4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    icon: { marginRight: 10 },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Dank Mono Bold',
        includeFontPadding: false,
        letterSpacing: 0.5,
    },
});
