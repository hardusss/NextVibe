import { useWallet } from "@lazorkit/wallet-mobile-adapter";
import { useMemo, useState, useEffect } from "react";
import { Connection, Transaction, VersionedTransaction, TransactionSignature } from "@solana/web3.js";
import { storage } from "@/src/utils/storage";

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
 * iOS-specific wallet hook — returns deep-linked wallet if active, otherwise falls back to LazorKit.
 */
export default function useWalletAddress(): WalletState {
    const { 
            smartWalletPubkey: lazorPubkey, 
            connection: lazorConnection, 
            disconnect: lazorDisconnect,
            signAndSendTransaction: lazorSignAndSendTransaction
        } = useWallet();

    const [deeplinkAddr, setDeeplinkAddr] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            const addr = await storage.getItem("deeplink_wallet_address");
            setDeeplinkAddr(addr);
        };
        load();
    }, []);

    return useMemo(() => {
        if (deeplinkAddr) {
            const connection = new Connection("https://api.mainnet-beta.solana.com");
            return { 
                address: deeplinkAddr, 
                connection,
                disconnect: async () => {
                    await storage.removeItem("deeplink_wallet_address");
                    await storage.removeItem("deeplink_wallet_type");
                    setDeeplinkAddr(null);
                },
                signAndSendTransaction: async (transaction, minContextSlot) => {
                    throw new Error("Signing transactions via deep links is not supported yet");
                },
                signTransaction: async (transaction) => {
                    throw new Error("Signing transactions via deep links is not supported yet");
                },
                walletType: 'mwa'
            } as WalletState;
        }

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
    }, [deeplinkAddr, lazorPubkey, lazorConnection, lazorDisconnect]);
}
