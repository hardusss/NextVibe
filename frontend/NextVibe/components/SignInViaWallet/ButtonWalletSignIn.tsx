import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { Wallet } from 'lucide-react-native';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

import { generateUsername } from "@/src/utils/solana/getWalletDomainName";
import walletSignIn from "@/src/api/wallet.sign.in";
import { storage } from "@/src/utils/storage";

export interface SignInPayload {
    pubkey: string;
    signature: Uint8Array;
    message: string;
    username: string;
}

interface ButtonWalletSignInProps {
    onSuccess: (backendResponse?: any) => void;
    onError?: (error: any) => void;
    buttonStyle?: ViewStyle;
    textStyle?: TextStyle;
    title?: string;
}

/**
 * A button component that handles the Solana Mobile Wallet Adapter (MWA) authentication.
 * It ensures the global wallet context is updated via `connect()` before signing the payload.
 */
export default function ButtonWalletSignIn({
    onSuccess,
    onError,
    buttonStyle,
    textStyle,
    title = "Sign in Via Wallet"
}: ButtonWalletSignInProps) {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [connectedUser, setConnectedUser] = useState<string | null>(null);
    
    // We strictly use the context's connect so the rest of the app knows the wallet is linked
    const { account, connect, disconnect } = useMobileWallet(); 
    
    const isMounted = useRef<boolean>(true);
    const pendingSign = useRef<boolean>(false);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Listen for global account changes. If we just connected specifically for signing, proceed to sign.
    useEffect(() => {
        if (pendingSign.current && account?.address) {
            pendingSign.current = false;
            executeSignAndLogin(account.address.toString());
        }
    }, [account]);

    /**
     * Decodes a Base64URL string returned by MWA into a standard Base58 Solana public key.
     */
    const getBase58Pubkey = (b64Address: string): string => {
        const base64String = b64Address.replace(/-/g, '+').replace(/_/g, '/');
        const pubkeyBytes = Buffer.from(base64String, 'base64');
        return new PublicKey(pubkeyBytes).toBase58();
    };

    /**
     * Executes the signing process and sends the payload to the backend.
     * Assumes the wallet is already connected to the global context.
     */
    const executeSignAndLogin = async (accountAddress: string) => {
        try {
            const authData = await transact(async (wallet) => {
                // Since MWA caches sessions, this authorize should bypass the connect prompt 
                // and proceed directly to the action if already connected via context.
                const authorizationResult = await wallet.authorize({
                    cluster: 'devnet',
                    identity: {
                        name: 'NextVibe',
                        uri: 'https://nextvibe.io',
                        icon: 'favicon.ico',
                    },
                });

                const currentAccount = authorizationResult.accounts[0];
                const pubkeyString = getBase58Pubkey(currentAccount.address.toString());

                const nonce = Date.now().toString();
                const messageToSign = `Sign in to NextVibe.\nNonce: ${nonce}`;
                const messageBytes = new TextEncoder().encode(messageToSign);

                const signedMessages = await wallet.signMessages({
                    addresses: [currentAccount.address],
                    payloads: [messageBytes],
                });

                return {
                    pubkey: pubkeyString,
                    signature: signedMessages[0],
                    message: messageToSign,
                };
            });

            // Domain resolution
            const resolvedUsername = await generateUsername(authData.pubkey);

            const payload: SignInPayload = {
                pubkey: authData.pubkey,
                signature: authData.signature,
                message: authData.message,
                username: resolvedUsername,
            };

            // Backend Auth
            const backendResponse = await walletSignIn(payload);

            if (backendResponse?.token) {
                storage.setItem("id", `${backendResponse.user_id}`);
                await storage.setItem("access", backendResponse.token.access);
                await storage.setItem("refresh", backendResponse.token.refresh);
            }

            if (!isMounted.current) return;
            
            setConnectedUser(resolvedUsername);
            setIsLoading(false);
            onSuccess(backendResponse);

        } catch (error) {
            if (!isMounted.current) return;
            
            // Clean up if signing or backend fails so the user isn't stuck in a weird state
            await disconnect().catch(() => {});
            setIsLoading(false);
            console.error("Wallet Sign-In Error:", error);
            onError?.(error);
        }
    };

    /**
     * Entry point for the button press.
     * Determines if we need to connect first or if we can jump straight to signing.
     */
    const handleInitialPress = async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            if (account?.address) {
                // Already connected in global state, just sign
                await executeSignAndLogin(account.address.toString());
            } else {
                // Not connected globally. Mark pending sign and trigger context connect
                pendingSign.current = true;
                await connect();
            }
        } catch (error) {
            if (!isMounted.current) return;
            
            pendingSign.current = false;
            setIsLoading(false);
            console.error("Connect Context Error:", error);
            onError?.(error);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.buttonContainer, buttonStyle]}
            onPress={handleInitialPress}
            disabled={isLoading}
            activeOpacity={0.8}
        >
            {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
                <>
                    <Wallet size={20} color="#FFFFFF" style={styles.icon} />
                    <Text style={[styles.buttonText, textStyle]}>
                        {connectedUser ? `Connected: ${connectedUser}` : title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    buttonContainer: {
        backgroundColor: '#0A0410',
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#A78BFA',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: 56,
        shadowColor: '#A78BFA',
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