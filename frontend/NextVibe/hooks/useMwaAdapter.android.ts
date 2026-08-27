// @ts-ignore
import { useMobileWallet } from '@wallet-ui/react-native-web3js/dist/index.native.mjs';
import { useCallback } from 'react';
import { walletLogger, WalletTag } from '@/src/utils/walletLogger';

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

export function useMwaAdapter(): MwaAdapterResult {
    const rawAdapter = useMobileWallet() as MwaAdapterResult;

    const connect = useCallback(async (wallet?: 'phantom' | 'solflare' | 'backpack') => {
        walletLogger.info(WalletTag.MWA_ANDROID, 'Starting Android MWA connection session', { targetWallet: wallet || 'system-default' });
        try {
            const acc = await rawAdapter.connect(wallet);
            if (acc) {
                const addr = acc.address?.toString?.() || acc.publicKey?.toBase58?.();
                walletLogger.info(WalletTag.MWA_ANDROID, `Android MWA connection successful! Address: ${addr}`, {
                    address: addr,
                    label: acc.label,
                });
            } else {
                walletLogger.warn(WalletTag.MWA_ANDROID, 'Android MWA connect returned null or cancelled by user');
            }
            return acc;
        } catch (error) {
            walletLogger.error(WalletTag.MWA_ANDROID, 'Android MWA connection failed with error', error, { targetWallet: wallet });
            throw error;
        }
    }, [rawAdapter.connect]);

    const disconnect = useCallback(async () => {
        walletLogger.info(WalletTag.MWA_ANDROID, 'Disconnecting Android MWA session');
        try {
            await rawAdapter.disconnect();
            walletLogger.info(WalletTag.MWA_ANDROID, 'Android MWA session disconnected successfully');
        } catch (error) {
            walletLogger.error(WalletTag.MWA_ANDROID, 'Error disconnecting Android MWA session', error);
            throw error;
        }
    }, [rawAdapter.disconnect]);

    return {
        account: rawAdapter.account,
        connect,
        disconnect,
    };
}

