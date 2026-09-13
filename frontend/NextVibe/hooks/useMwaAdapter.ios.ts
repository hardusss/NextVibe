import { useState, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { storage } from '@/src/utils/storage';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';
import {
    beginConnect,
    disconnectDeepLinkWallet,
    WALLET_DEEPLINK_EVENTS,
    DEEPLINK_STORAGE_KEYS,
    type DeepLinkWalletType,
} from '@/src/services/walletDeepLink';

export interface MwaAccount {
    address: { toString(): string };
    publicKey: { toBase58(): string };
    label?: string;
}

export interface MwaAdapterResult {
    account: MwaAccount | null;
    connect: (wallet?: 'phantom' | 'solflare' | 'backpack') => Promise<MwaAccount | null>;
    disconnect: () => Promise<void>;
}

const toAccount = (address: string, walletType?: string | null): MwaAccount => ({
    address,
    publicKey: new PublicKey(address),
    label: `${walletType ? walletType.charAt(0).toUpperCase() + walletType.slice(1) : 'Deep Link'} Wallet`,
});

export function useMwaAdapter(): MwaAdapterResult {
    const [account, setAccount] = useState<MwaAccount | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const addr = await storage.getItem(DEEPLINK_STORAGE_KEYS.address);
                const wType = await storage.getItem(DEEPLINK_STORAGE_KEYS.type);
                if (addr) {
                    walletLogger.info(WalletTag.MWA_IOS, `Loaded cached deep link wallet from storage: ${addr}`, {
                        address: addr,
                        walletType: wType,
                    });
                    setAccount(toAccount(addr, wType));
                }
            } catch (storageErr) {
                walletLogger.error(WalletTag.MWA_IOS, 'Failed to read deeplink wallet from storage', storageErr);
            }
        };
        load();

        const connectedSub = DeviceEventEmitter.addListener(
            WALLET_DEEPLINK_EVENTS.connected,
            ({ address, walletType }: { address: string; walletType?: string }) => {
                setAccount(toAccount(address, walletType));
            }
        );
        const disconnectedSub = DeviceEventEmitter.addListener(
            WALLET_DEEPLINK_EVENTS.disconnected,
            () => setAccount(null)
        );
        return () => {
            connectedSub.remove();
            disconnectedSub.remove();
        };
    }, []);

    const connect = async (walletType: DeepLinkWalletType = 'phantom'): Promise<MwaAccount | null> => {
        walletLogger.info(WalletTag.MWA_IOS, `Initiating connection request to [${walletType}]`);
        const result = await beginConnect(walletType);
        const acc = toAccount(result.address, result.walletType);
        setAccount(acc);
        return acc;
    };

    const disconnect = async () => {
        await disconnectDeepLinkWallet();
        setAccount(null);
    };

    return {
        account,
        connect,
        disconnect
    };
}
