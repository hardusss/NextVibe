import { Connection } from '@solana/web3.js';

/**
 * Checks whether an error is caused by a WebSocket transaction confirmation timeout
 * (e.g. TransactionExpiredTimeoutError), and if so, verifies directly with the RPC
 * whether the transaction actually landed on-chain.
 *
 * @param connection - Solana Connection instance
 * @param err - Caught error from wallet execution
 * @returns Confirmed transaction signature string if successful on-chain, or null otherwise
 */
export async function verifyTimeoutTransaction(
    connection: Connection | null,
    err: unknown
): Promise<string | null> {
    if (!err) return null;

    const rawMsg = err instanceof Error ? err.message : String(err || '');
    const errObj = typeof err === 'object' && err !== null ? (err as Record<string, any>) : {};

    const isTimeout =
        errObj.name === 'TransactionExpiredTimeoutError' ||
        rawMsg.includes('Transaction was not confirmed in') ||
        rawMsg.includes('has expired') ||
        rawMsg.includes('Check signature');

    if (!isTimeout) return null;

    // Extract signature from error property or regex
    let sig: string | undefined = errObj.signature;

    if (!sig) {
        const match =
            rawMsg.match(/signature\s+([1-9A-HJ-NP-Za-km-z]{64,128})/i) ||
            rawMsg.match(/Signature\s+([1-9A-HJ-NP-Za-km-z]+)/) ||
            rawMsg.match(/([1-9A-HJ-NP-Za-km-z]{80,90})/);
        if (match) {
            sig = match[1];
        }
    }

    if (!sig) return null;

    console.log(`[TransactionConfirmation] Timeout detected for signature: ${sig}. Checking on-chain status...`);

    const rpcConn = connection || new Connection('https://api.nextvibe.io/api/v1/wallets/rpc/', 'confirmed');

    try {
        // Poll status up to 3 times with short interval to allow block propagation
        for (let attempt = 0; attempt < 3; attempt++) {
            const statusRes = await rpcConn.getSignatureStatus(sig, { searchTransactionHistory: true });
            const status = statusRes?.value;

            if (status) {
                if (status.err) {
                    console.warn(`[TransactionConfirmation] Transaction ${sig} failed on-chain:`, status.err);
                    throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
                }

                // If confirmationStatus is processed, confirmed, or finalized, it succeeded!
                if (
                    status.confirmationStatus === 'processed' ||
                    status.confirmationStatus === 'confirmed' ||
                    status.confirmationStatus === 'finalized' ||
                    status.confirmations !== null
                ) {
                    console.log(`[TransactionConfirmation] Signature ${sig} confirmed on-chain! Status: ${status.confirmationStatus}`);
                    return sig;
                }
            }

            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }
    } catch (checkErr) {
        if (checkErr instanceof Error && checkErr.message.includes('failed on-chain')) {
            throw checkErr;
        }
        console.warn('[TransactionConfirmation] RPC status check failed:', checkErr);
    }

    return null;
}
