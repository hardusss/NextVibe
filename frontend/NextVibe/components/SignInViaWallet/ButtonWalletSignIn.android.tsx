import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
// @ts-ignore
import { useMobileWallet } from "@wallet-ui/react-native-web3js/dist/index.native.mjs";
import walletSignIn from "@/src/api/wallet.sign.in";
import { storage } from "@/src/utils/storage";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import InviteCodeSheet from '../oauth-components/InviteCodeSheet';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

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
 * A button component that triggers the Solana Mobile Wallet Adapter flow via global provider.
 * Authenticates the user, extracts the wallet's native domain label, signs a payload, 
 * and handles backend authorization while keeping global state in sync.
 */
export default function ButtonWalletSignIn({
    onSuccess,
    onError,
    buttonStyle,
    textStyle,
    title = "Sign in Via Wallet"
}: ButtonWalletSignInProps) {
    const [isLoading, setIsLoading] = useState(false);
    const isMounted = useRef(true);

    const sheetRef = useRef<BottomSheetModal>(null);
    const pendingRef = useRef<SignInPayload | null>(null);

    const { connect, signMessage } = useMobileWallet();

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const handleConnectAndSign = async () => {
        if (isLoading) return;
        setIsLoading(true);
        walletLogger.info(WalletTag.MWA_ANDROID, 'ButtonWalletSignIn: Initiating MWA connect & sign flow');

        try {
            const connectedAccount = await connect();

            if (!connectedAccount) {
                const cancelErr = new Error("Wallet connection failed or was cancelled.");
                walletLogger.warn(WalletTag.MWA_ANDROID, 'ButtonWalletSignIn: Wallet connect returned null or cancelled');
                throw cancelErr;
            }

            const pubkeyString = connectedAccount.publicKey.toBase58();
            const nativeLabel = connectedAccount.label || `vibe_${pubkeyString.slice(0, 6)}.skr`;
            walletLogger.info(WalletTag.MWA_ANDROID, `ButtonWalletSignIn: Connected account: ${pubkeyString} (${nativeLabel})`);

            const nonce = Date.now().toString();
            const messageToSign = `Sign in to NextVibe.\nNonce: ${nonce}`;
            const messageBytes = new TextEncoder().encode(messageToSign);

            walletLogger.debug(WalletTag.MWA_ANDROID, 'ButtonWalletSignIn: Requesting signMessage from wallet...', { messageToSign });
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const signature = await signMessage(messageBytes);

            if (!signature) {
                const signErr = new Error("Message signing was rejected.");
                walletLogger.warn(WalletTag.MWA_ANDROID, 'ButtonWalletSignIn: User rejected message signing');
                throw signErr;
            }

            walletLogger.info(WalletTag.MWA_ANDROID, `ButtonWalletSignIn: Signature received (${signature.length} bytes), calling walletSignIn...`);
            const backendResponse = await walletSignIn({
                pubkey: pubkeyString,
                signature: signature,
                message: messageToSign,
                username: nativeLabel,
            });

            if (backendResponse?.token) {
                walletLogger.info(WalletTag.MWA_ANDROID, `ButtonWalletSignIn: Auth tokens received for user_id: ${backendResponse.user_id}`);
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
                walletLogger.info(WalletTag.MWA_ANDROID, 'ButtonWalletSignIn: invite_code_required from backend, opening invite sheet');
                const pubkeyString = JSON.parse(error.config.data).wallet_address;
                const messageToSign = JSON.parse(error.config.data).message;
                const signature = new Uint8Array(JSON.parse(error.config.data).signature);
                const username = JSON.parse(error.config.data).username;
                
                pendingRef.current = {
                    pubkey: pubkeyString,
                    signature: signature,
                    message: messageToSign,
                    username: username,
                };
                sheetRef.current?.present();
                return;
            }

            walletLogger.error(WalletTag.MWA_ANDROID, "ButtonWalletSignIn: Error in connect and sign flow", error);
            onError?.(error);
        }
    };

    const handleInviteSubmit = async (inviteCode: string) => {
        const pending = pendingRef.current;
        if (!pending) return;

        walletLogger.info(WalletTag.MWA_ANDROID, `ButtonWalletSignIn: Submitting invite code registration for ${pending.pubkey}`);
        try {
            const backendResponse = await walletSignIn(pending, inviteCode);

            if (backendResponse?.token) {
                walletLogger.info(WalletTag.MWA_ANDROID, `ButtonWalletSignIn: Invite auth success! user_id: ${backendResponse.user_id}`);
                await storage.setItem("id", `${backendResponse.user_id}`);
                await storage.setItem("access", backendResponse.token.access);
                await storage.setItem("refresh", backendResponse.token.refresh);
            }

            pendingRef.current = null;
            sheetRef.current?.dismiss();
            onSuccess(backendResponse);
        } catch (error: any) {
            walletLogger.error(WalletTag.MWA_ANDROID, "ButtonWalletSignIn: Invite code registration error", error);
            throw error;
        }
    };

    return (
        <View>
            <TouchableOpacity
                style={[styles.buttonContainer, buttonStyle]}
                onPress={handleConnectAndSign}
                disabled={isLoading}
                activeOpacity={0.8}
            >
                {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <>
                        <Wallet size={20} color="#FFFFFF" style={styles.icon} />
                        <Text style={[styles.buttonText, textStyle]}>
                            {title}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            <InviteCodeSheet ref={sheetRef} onSubmit={handleInviteSubmit} />
        </View>
    );
};

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