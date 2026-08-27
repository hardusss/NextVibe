// @ts-ignore
import { useMobileWallet } from "@wallet-ui/react-native-web3js/dist/index.native.mjs";
import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import { useMemo, useEffect, useRef } from "react";
import { Connection, Transaction, VersionedTransaction, TransactionSignature } from "@solana/web3.js";
import { walletLogger, WalletTag } from "@/src/utils/walletLogger";

// 1. Define strict, mutually exclusive states
export type WalletState = 
    | { 
        address: string; 
        connection: Connection; 
        disconnect: () => Promise<void>;
        signAndSendTransaction: (transaction: Transaction | VersionedTransaction, minContextSlot: number) => Promise<TransactionSignature>;
        signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
        walletType: 'mwa' 
      }
    | { 
        address: string; 
        connection: Connection; 
        disconnect: () => Promise<void> | void; 
        signAndSendTransaction: (payload: any, options: any) => Promise<string>; 
        signTransaction: null;
        walletType: 'lazorkit' 
      }
    | { 
        address: null; 
        connection: null;
        disconnect: () => Promise<void>;
        signAndSendTransaction: (transaction: Transaction | VersionedTransaction, minContextSlot: number) => Promise<TransactionSignature>;
        signTransaction: null;
        walletType: 'none' 
      };

// 2. Force the hook to return the Discriminated Union
export default function useWalletAddress(): WalletState {
    const { 
            account: mwaAccount,
            connection: mwaConnection, 
            disconnect: mwaDisconnect, 
            signAndSendTransaction: mwaSignAndSendTransaction,
            signTransaction: mwaSignTransaction,
        } = useMobileWallet();
    const { 
            smartWalletPubkey: lazorPubkey, 
            connection: lazorConnection, 
            disconnect: lazorDisconnect,
            signAndSendTransaction: lazorSignAndSendTransaction
        } = useWallet();

    const activeState = useMemo(() => {
        if (mwaAccount && mwaConnection) {
            return { 
                address: (mwaAccount.publicKey).toString(), 
                connection: mwaConnection,
                disconnect: async () => {
                    walletLogger.info(WalletTag.STATE, 'useWalletAddress: Disconnecting active MWA wallet');
                    await mwaDisconnect();
                },
                signAndSendTransaction: mwaSignAndSendTransaction,
                signTransaction: mwaSignTransaction,
                walletType: 'mwa'
            } as WalletState;
        } 
        
        if (lazorPubkey && lazorConnection) {
            return { 
                address: lazorPubkey.toString(), 
                connection: lazorConnection,
                disconnect: async () => {
                    walletLogger.info(WalletTag.STATE, 'useWalletAddress: Disconnecting active LazorKit wallet');
                    await lazorDisconnect();
                },
                signAndSendTransaction: lazorSignAndSendTransaction,
                signTransaction: null,
                walletType: 'lazorkit'
            } as WalletState;
        }

        return { 
            address: null, 
            connection: null, 
            disconnect: async () => {},
            signAndSendTransaction: async () => '',
            signTransaction: null,
            walletType: 'none' 
        } as WalletState;
    }, [mwaAccount, mwaConnection, lazorPubkey, lazorConnection, mwaDisconnect, lazorDisconnect, mwaSignTransaction]);

    const prevWalletRef = useRef<string | null>(null);
    useEffect(() => {
        const currentDescriptor = `${activeState.walletType}:${activeState.address || 'none'}`;
        if (prevWalletRef.current !== currentDescriptor) {
            walletLogger.info(WalletTag.STATE, `useWalletAddress (Android): State transition -> ${activeState.walletType} (${activeState.address || 'no-address'})`);
            prevWalletRef.current = currentDescriptor;
        }
    }, [activeState.walletType, activeState.address]);

    return activeState;
}