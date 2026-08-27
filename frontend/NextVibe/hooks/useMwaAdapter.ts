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
    return {
        account: null,
        connect: async () => {
            const err = new Error("MWA is not supported on this platform");
            walletLogger.warn(WalletTag.MWA, 'Attempted to invoke MWA on unsupported platform', { error: err.message });
            throw err;
        },
        disconnect: async () => {
            walletLogger.debug(WalletTag.MWA, 'Fallback disconnect called (no-op)');
        }
    };
}

