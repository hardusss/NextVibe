import { useState, useCallback, useRef, useEffect } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import JupiterService from '@/src/services/JupiterService';
import type { JupiterQuoteResponse } from '@/src/types/jupiter';
import useWalletAddress from './useWalletAddress';
import { TOKEN_MINT_CONSTANTS } from '@/constants/Tokens';
import { Buffer } from 'buffer';

export default function useJupiterSwap() {
    const wallet = useWalletAddress();
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
            // Note: lazorkit uses a different signature for signAndSendTransaction, handling via type guards
            let signature: string;

            if (wallet.walletType === 'lazorkit') {
                const signWithLazor = wallet.signAndSendTransaction as (payload: any, options: any) => Promise<string>;
                // lazorkit adapter may require a base64 string or an object depending on version, 
                // assuming payload is the base64 string or VersionedTx here based on typical usage
                signature = await signWithLazor(
                    { transaction: swapTransaction, isVersioned: true }, 
                    { redirectUrl: 'nextvibe://swap' }
                );
            } else if (wallet.walletType === 'mwa') {
                const signWithMWA = wallet.signAndSendTransaction as (tx: VersionedTransaction, minSlot?: number) => Promise<string>;
                signature = await signWithMWA(transaction);
            } else {
                throw new Error("Unsupported wallet type.");
            }

            return { signature };
        } catch (err: any) {
            console.error('[useJupiterSwap] Swap error:', err);
            let errMsg = err.message || 'Swap failed';
            if (errMsg.includes('CancellationException') || errMsg.includes('User rejected')) {
                errMsg = 'Transaction cancelled by user.';
            }
            setSwapError(errMsg);
            return { error: errMsg };
        } finally {
            setIsSwapLoading(false);
        }
    }, [quote, wallet]);

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
