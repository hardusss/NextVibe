// @ts-ignore
import { useMobileWallet } from '@wallet-ui/react-native-web3js/dist/index.native.mjs';

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
    return useMobileWallet() as MwaAdapterResult;
}
