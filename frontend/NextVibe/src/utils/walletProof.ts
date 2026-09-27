import { walletLogger, WalletTag } from './walletLogger';

/**
 * Proof that this account controls a wallet: the wallet signs
 * "Verify wallet for NextVibe.\nNonce: <ms>" and the server checks it
 * (backend verification/wallets.py). Sent to save-wallet and
 * seeker/verify; Seeker Verified needs a proven wallet.
 */
export interface WalletProof {
    message: string;
    signature: number[];
}

export type SignMessage = (message: Uint8Array) => Promise<Uint8Array | null | undefined>;

export const proofMessage = (now: number = Date.now()) => `Verify wallet for NextVibe.\nNonce: ${now}`;

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Wallets answer with the 64-byte signature, or with the message and the signature joined. */
export function detachedSignature(signed: Uint8Array, message: Uint8Array): Uint8Array {
    if (signed.length === message.length + 64) {
        if (sameBytes(signed.subarray(0, message.length), message)) return signed.subarray(message.length);
        if (sameBytes(signed.subarray(64), message)) return signed.subarray(0, 64);
    }
    return signed;
}

/** Asks the wallet to sign the verify message. null when it can't or the person declines. */
export async function signWalletProof(signMessage?: SignMessage, now?: number): Promise<WalletProof | null> {
    if (!signMessage) return null;
    const message = proofMessage(now);
    const bytes = new TextEncoder().encode(message);
    try {
        const signed = await signMessage(bytes);
        if (!signed || !signed.length) return null;
        return { message, signature: Array.from(detachedSignature(signed, bytes)) };
    } catch (error) {
        walletLogger.warn(WalletTag.MWA, 'walletProof: the wallet did not sign the verify message', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
