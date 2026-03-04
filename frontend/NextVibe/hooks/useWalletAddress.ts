import { useMobileWallet } from "@wallet-ui/react-native-web3js";
import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import { useMemo } from "react";
import { Connection, Transaction, VersionedTransaction, TransactionSignature } from "@solana/web3.js";

// 1. Define strict, mutually exclusive states
export type WalletState = 
    | { 
        address: string; 
        connection: Connection; 
        disconnect: () => Promise<void>; // Updated to Promise<void>
        signAndSendTransaction: (transaction: Transaction | VersionedTransaction, minContextSlot: number) => Promise<TransactionSignature>; // Added minContextSlot
        walletType: 'mwa' 
      }
    | { 
        address: string; 
        connection: Connection; 
        disconnect: () => Promise<void> | void; 
        signAndSendTransaction: (payload: any, options: any) => Promise<string>; 
        walletType: 'lazorkit' 
      }
    | { 
        address: null; 
        connection: null;
        disconnect: () => Promise<void>; // Updated to Promise<void>
        signAndSendTransaction: (transaction: Transaction | VersionedTransaction, minContextSlot: number) => Promise<TransactionSignature>;  
        walletType: 'none' 
      };

// 2. Force the hook to return the Discriminated Union
export default function useWalletAddress(): WalletState {
    const { 
            account: mwaAccount,
            connection: mwaConnection, 
            disconnect: mwaDisconnect, 
            signAndSendTransaction: mwaSignAndSendTransaction
        } = useMobileWallet();
    const { 
            smartWalletPubkey: lazorPubkey, 
            connection: lazorConnection, 
            disconnect: lazorDisconnect,
            signAndSendTransaction: lazorSignAndSendTransaction
        } = useWallet();

    return useMemo(() => {
        if (mwaAccount && mwaConnection) {
            return { 
                address: (mwaAccount.publicKey).toString(), 
                connection: mwaConnection,
                disconnect: mwaDisconnect,
                signAndSendTransaction: mwaSignAndSendTransaction,
                walletType: 'mwa'
            } as WalletState;
        } 
        
        if (lazorPubkey && lazorConnection) {
            return { 
                address: lazorPubkey.toString(), 
                connection: lazorConnection,
                disconnect: lazorDisconnect,
                signAndSendTransaction: lazorSignAndSendTransaction,
                walletType: 'lazorkit'
            } as WalletState;
        }

        return { 
            address: null, 
            connection: null, 
            walletType: 'none' 
        } as WalletState;
    }, [mwaAccount, mwaConnection, lazorPubkey, lazorConnection, mwaDisconnect, lazorDisconnect]);
}