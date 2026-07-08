import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import { useMemo } from "react";
import { Connection, Transaction, VersionedTransaction, TransactionSignature } from "@solana/web3.js";

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

/**
 * iOS-specific wallet hook — only LazorKit is available.
 * MWA (Mobile Wallet Adapter) is not used on iOS.
 */
export default function useWalletAddress(): WalletState {
    const { 
            smartWalletPubkey: lazorPubkey, 
            connection: lazorConnection, 
            disconnect: lazorDisconnect,
            signAndSendTransaction: lazorSignAndSendTransaction
        } = useWallet();

    return useMemo(() => {
        if (lazorPubkey && lazorConnection) {
            return { 
                address: lazorPubkey.toString(), 
                connection: lazorConnection,
                disconnect: lazorDisconnect,
                signAndSendTransaction: lazorSignAndSendTransaction,
                signTransaction: null,
                walletType: 'lazorkit'
            } as WalletState;
        }

        return { 
            address: null, 
            connection: null, 
            signTransaction: null,
            walletType: 'none' 
        } as WalletState;
    }, [lazorPubkey, lazorConnection, lazorDisconnect]);
}
