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
            throw new Error("MWA is not supported on this platform");
        },
        disconnect: async () => {}
    };
}
