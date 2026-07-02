import { useState, useCallback, useRef, useEffect } from 'react';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import JupiterService from '@/src/services/JupiterService';
import type { JupiterQuoteResponse } from '@/src/types/jupiter';
import useWalletAddress from './useWalletAddress';
import usePaymaster from './usePaymaster';
import { TOKEN_MINT_CONSTANTS } from '@/constants/Tokens';
import { Buffer } from 'buffer';

export default function useJupiterSwap() {
    const wallet = useWalletAddress();
    const {
        isGaslessAvailable,
        sendSponsoredTransaction,
        incrementCount,
        classifyError,
    } = usePaymaster();

    const [quote, setQuote] = useState<JupiterQuoteResponse | null>(null);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [isSwapLoading, setIsSwapLoading] = useState(false);
    const [swapError, setSwapError] = useState<string | null>(null);

    const abortController = useRef<AbortController | null>(null);

    const getMint = (mintOrNull: string | null) => mintOrNull || TOKEN_MINT_CONSTANTS.SOL_MINT_ADDRESS;

    const fetchQuote = useCallback(
        async (inputMint: string | null, outputMint: string | null, amountRaw: number, slippageBps: number = 50) => {
            if (amountRaw <= 0) {
                setQuote(null);
                setQuoteError(null);
                return;
            }

            if (abortController.current) {
                abortController.current.abort();
            }
            abortController.current = new AbortController();
            
            setIsQuoteLoading(true);
            setQuoteError(null);
            
            try {
                const response = await JupiterService.getQuote({
                    inputMint: getMint(inputMint),
                    outputMint: getMint(outputMint),
                    amount: Math.floor(amountRaw).toString(),
                    slippageBps,
                });
                
                if (abortController.current.signal.aborted) return;
                
                setQuote(response);
            } catch (err: any) {
                if (abortController.current.signal.aborted) return;
                console.error('[useJupiterSwap] Quote error:', err);
                setQuoteError(err.message || 'Failed to fetch quote');
                setQuote(null);
            } finally {
                if (!abortController.current.signal.aborted) {
                    setIsQuoteLoading(false);
                }
            }
        },
        []
    );

    const clearQuote = useCallback(() => {
        setQuote(null);
        setQuoteError(null);
    }, []);

    const executeSwap = useCallback(async (): Promise<{signature?: string, error?: string}> => {
        if (!quote) {
            setSwapError('No quote available to swap.');
            return { error: 'No quote available to swap.' };
        }
        if (wallet.walletType === 'none' || !wallet.address || !wallet.connection) {
            setSwapError('Wallet not connected.');
            return { error: 'Wallet not connected.' };
        }

        setIsSwapLoading(true);
        setSwapError(null);

        try {
            // 1. Build transaction using Jupiter API
            const { swapTransaction } = await JupiterService.getSwapTransaction({
                quoteResponse: quote,
                userPublicKey: wallet.address,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto',
            });

            // 2. Deserialize transaction
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            // 3. Sign and send transaction using the adapter
            let signature: string;

            if (wallet.walletType === 'lazorkit') {
                // Lazorkit: paymaster handled by LazorKitProvider config
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                signature = await signWithLazor(
                    { transaction: swapTransaction, isVersioned: true }, 
                    { redirectUrl: 'nextvibe://swap' }
                );
                // Track gasless usage — Lazorkit uses Kora paymaster under the hood
                await incrementCount();
            } else if (wallet.walletType === 'mwa') {
                // MWA: Jupiter swaps use VersionedTransaction which the paymaster
                // can still broadcast, but partial-sign with VersionedTransaction
                // works the same way through signTransaction
                if (isGaslessAvailable) {
                    // Gasless path: user signs, Kora broadcasts
                    const signedTx = await wallet.signTransaction(transaction);
                    // Convert VersionedTransaction to serialized buffer for sendRawTransaction
                    const serialized = signedTx.serialize();
                    signature = await sendSponsoredRawTransaction(serialized);
                } else {
                    // Fallback: user pays gas
                    const signWithMWA = wallet.signAndSendTransaction as (tx: VersionedTransaction, minSlot?: number) => Promise<string>;
                    signature = await signWithMWA(transaction);
                }
            } else {
                throw new Error("Unsupported wallet type.");
            }

            return { signature };
        } catch (err: any) {
            console.error('[useJupiterSwap] Swap error:', err);
            let errMsg: string;

            if (err.message?.includes('CancellationException') || err.message?.includes('User rejected')) {
                errMsg = 'Transaction cancelled by user.';
            } else {
                const parsed = classifyError(err);
                errMsg = parsed.userMessage;
            }

            setSwapError(errMsg);
            return { error: errMsg };
        } finally {
            setIsSwapLoading(false);
        }
    }, [quote, wallet, isGaslessAvailable]);

    /**
     * Send a raw serialized transaction through the paymaster connection.
     * Used for VersionedTransaction which can't go through sendSponsoredTransaction
     * (that one expects a legacy Transaction object).
     */
    const sendSponsoredRawTransaction = async (serialized: Uint8Array): Promise<string> => {
        const { getPaymasterConnection } = await import('@/src/services/PaymasterConnection');
        const { usePaymasterStore } = await import('@/src/stores/paymasterStore');
        const conn = getPaymasterConnection();

        const sig = await conn.sendRawTransaction(
            Buffer.from(serialized),
            {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3,
            },
        );

        // Increment the daily counter on success
        await usePaymasterStore.getState().incrementCount();

        return sig;
    };

    // Cleanup abort controller on unmount
    useEffect(() => {
        return () => {
            if (abortController.current) {
                abortController.current.abort();
            }
        };
    }, []);

    return {
        quote,
        isQuoteLoading,
        quoteError,
        fetchQuote,
        clearQuote,
        executeSwap,
        isSwapLoading,
        swapError,
    };
}
