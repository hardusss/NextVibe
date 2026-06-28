import { useEffect } from 'react';
import { Connection, Transaction } from '@solana/web3.js';
import { usePaymasterStore } from '@/src/stores/paymasterStore';
import { getPaymasterConnection } from '@/src/services/PaymasterConnection';
import {
    parsePaymasterError,
    isAccountCreationError,
    isLimitExceededError,
    type PaymasterError,
} from '@/src/utils/solana/paymasterErrors';

/**
 * usePaymaster
 *
 * Central hook for gasless transaction sponsorship via the NextVibe
 * Kora Paymaster. Provides:
 *
 *   - Connection instance with auth headers pre-injected
 *   - Daily usage counter (X / 10)
 *   - `sendSponsoredTransaction()` for broadcasting partially-signed txs
 *   - Error classification helpers
 *
 * @example
 * ```tsx
 * const { isGaslessAvailable, sendSponsoredTransaction, txCountToday } = usePaymaster();
 *
 * // In your tx flow:
 * if (isGaslessAvailable) {
 *     const signedTx = await walletSignTransaction(tx);
 *     const sig = await sendSponsoredTransaction(signedTx);
 * }
 * ```
 */
export default function usePaymaster() {
    const {
        txCountToday,
        maxTxPerDay,
        isGaslessAvailable,
        isLoading,
        loadTodayCount,
        incrementCount,
        resetIfNewDay,
    } = usePaymasterStore();

    // Load counter on first mount & reset if day rolled over
    useEffect(() => {
        resetIfNewDay().then(() => loadTodayCount());
    }, []);

    /** The pre-configured Connection pointing at the Kora Paymaster RPC. */
    const paymasterConnection: Connection = getPaymasterConnection();

    /**
     * Sends a partially-signed transaction to the Kora Paymaster.
     *
     * The paymaster will:
     *   1. Verify the transaction contains only allowed programs/tokens
     *   2. Append the fee payer signature
     *   3. Broadcast to the Solana network
     *
     * On success, increments the daily counter automatically.
     *
     * @param transaction — A Transaction that has been signed by the user
     *   but NOT by the fee payer.
     * @returns The transaction signature string.
     */
    const sendSponsoredTransaction = async (
        transaction: Transaction,
    ): Promise<string> => {
        try {
            const serialized = transaction.serialize({
                requireAllSignatures: false, // Fee payer hasn't signed yet
                verifySignatures: false,
            });

            const signature = await paymasterConnection.sendRawTransaction(
                serialized,
                {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                    maxRetries: 3,
                },
            );

            // Successful broadcast → increment local counter
            await incrementCount();

            return signature;
        } catch (error: unknown) {
            // Re-check if the limit was exceeded server-side
            if (isLimitExceededError(error)) {
                usePaymasterStore.getState().setCount(maxTxPerDay);
            }
            throw error;
        }
    };

    /**
     * Parse any error into a structured PaymasterError with a
     * user-friendly message suitable for toast display.
     */
    const classifyError = (error: unknown): PaymasterError => {
        return parsePaymasterError(error);
    };

    return {
        // ── State ────────────────────────────────────────────────
        txCountToday,
        maxTxPerDay,
        isGaslessAvailable,
        isLoading,

        // ── Connection ───────────────────────────────────────────
        paymasterConnection,

        // ── Actions ──────────────────────────────────────────────
        sendSponsoredTransaction,
        incrementCount,

        // ── Error Helpers ────────────────────────────────────────
        classifyError,
        isAccountCreationError,
        isLimitExceededError,
    };
}
