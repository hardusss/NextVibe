export interface MwaAccount {
    address: { toString(): string };
    publicKey: { toBase58(): string };
    label?: string;
}

export interface MwaAdapterResult {
    account: MwaAccount | null;
    connect: () => Promise<MwaAccount | null>;
    disconnect: () => Promise<void>;
}

export function useMwaAdapter(): MwaAdapterResult {
    return {
        account: null,
        connect: async () => {
            throw new Error("MWA is not supported on iOS");
        },
        disconnect: async () => {}
    };
}
