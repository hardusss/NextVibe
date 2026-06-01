import { FormattedTransaction, SwapDetails } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";

/**
 * Finds token info from TOKENS constant by mint address or "SOL"
 */
function getTokenInfo(mintOrSymbol: string | null) {
    if (!mintOrSymbol || mintOrSymbol === "SOL" || mintOrSymbol === "So11111111111111111111111111111111111111112") {
        return TOKENS.SOL;
    }
    const token = Object.values(TOKENS).find(t => t.mint === mintOrSymbol);
    return token || null;
}

/**
 * Parses Helius EnhancedTransactions into FormattedTransactions for the UI
 */
export function parseHeliusTransactions(walletAddress: string, heliusTxs: any[]): FormattedTransaction[] {
    const formatted: FormattedTransaction[] = [];

    for (const tx of heliusTxs) {
        try {
            const signature = tx.signature;
            const time = tx.timestamp ? new Date(tx.timestamp * 1000) : null;
            
            // Calculate net balance changes for the wallet
            let solDiff = 0;
            const tokenDiffs: Record<string, number> = {};
            let hasMeaningfulSolTransfer = false;

            // Process Native Transfers (SOL)
            const myNativeTransfers = [];
            if (tx.nativeTransfers) {
                for (const t of tx.nativeTransfers) {
                    if (t.fromUserAccount === walletAddress) {
                        solDiff -= t.amount / 1e9;
                        myNativeTransfers.push(t);
                        if (t.amount > 5000) hasMeaningfulSolTransfer = true;
                    }
                    if (t.toUserAccount === walletAddress) {
                        solDiff += t.amount / 1e9;
                        myNativeTransfers.push(t);
                        if (t.amount > 5000) hasMeaningfulSolTransfer = true;
                    }
                }
            }

            // Process Token Transfers (SPL)
            const myTokenTransfers = [];
            if (tx.tokenTransfers) {
                for (const t of tx.tokenTransfers) {
                    if (t.fromUserAccount === walletAddress) {
                        tokenDiffs[t.mint] = (tokenDiffs[t.mint] || 0) - t.tokenAmount;
                        myTokenTransfers.push(t);
                    }
                    if (t.toUserAccount === walletAddress) {
                        tokenDiffs[t.mint] = (tokenDiffs[t.mint] || 0) + t.tokenAmount;
                        myTokenTransfers.push(t);
                    }
                }
            }

            // Group all diffs
            const diffs: { mint: string; diff: number }[] = [];
            if (Math.abs(solDiff) > 0.0001 && hasMeaningfulSolTransfer) {
                diffs.push({ mint: "SOL", diff: solDiff });
            }
            for (const [mint, diff] of Object.entries(tokenDiffs)) {
                if (Math.abs(diff) > 0) {
                    diffs.push({ mint, diff });
                }
            }

            // 1. Try to deduce SWAP
            const sold = diffs.filter(d => d.diff < 0);
            const bought = diffs.filter(d => d.diff > 0);

            // If we have both sold and bought, or if Helius explicitly calls it a SWAP with events
            if ((sold.length > 0 && bought.length > 0) || (tx.type === "SWAP" && tx.events?.swap)) {
                
                let inputMint = "Unknown";
                let inputAmount = 0;
                let outputMint = "Unknown";
                let outputAmount = 0;

                if (sold.length > 0 && bought.length > 0) {
                    const primarySold = sold.reduce((a, b) => (Math.abs(a.diff) > Math.abs(b.diff) ? a : b));
                    const primaryBought = bought.reduce((a, b) => (Math.abs(a.diff) > Math.abs(b.diff) ? a : b));
                    
                    inputMint = primarySold.mint;
                    inputAmount = Math.abs(primarySold.diff);
                    outputMint = primaryBought.mint;
                    outputAmount = Math.abs(primaryBought.diff);
                } else if (tx.events?.swap) {
                    // Fallback to Helius swap event data if diff deduction fails but event exists
                    const swapEvent = tx.events.swap;
                    if (swapEvent.nativeInput && swapEvent.nativeInput.account === walletAddress) {
                        inputMint = "SOL";
                        inputAmount = Number(swapEvent.nativeInput.amount) / 1e9;
                    } else if (swapEvent.tokenInputs && swapEvent.tokenInputs.length > 0) {
                        const tInput = swapEvent.tokenInputs.find((t: any) => t.userAccount === walletAddress) || swapEvent.tokenInputs[0];
                        inputMint = tInput.mint;
                        inputAmount = tInput.tokenAmount;
                    }

                    if (swapEvent.nativeOutput && swapEvent.nativeOutput.account === walletAddress) {
                        outputMint = "SOL";
                        outputAmount = Number(swapEvent.nativeOutput.amount) / 1e9;
                    } else if (swapEvent.tokenOutputs && swapEvent.tokenOutputs.length > 0) {
                        const tOutput = swapEvent.tokenOutputs.find((t: any) => t.userAccount === walletAddress) || swapEvent.tokenOutputs[0];
                        outputMint = tOutput.mint;
                        outputAmount = tOutput.tokenAmount;
                    }
                }

                if (inputMint !== "Unknown" && outputMint !== "Unknown") {
                    const inInfo = getTokenInfo(inputMint);
                    const outInfo = getTokenInfo(outputMint);

                    const swapDetails: SwapDetails = {
                        inputToken: inInfo?.symbol || (inputMint === "SOL" ? "SOL" : `${inputMint.slice(0, 4)}...`),
                        inputAmount,
                        inputLogoURL: inInfo?.logoURL || null,
                        outputToken: outInfo?.symbol || (outputMint === "SOL" ? "SOL" : `${outputMint.slice(0, 4)}...`),
                        outputAmount,
                        outputLogoURL: outInfo?.logoURL || null,
                    };

                    formatted.push({
                        signature,
                        type: "swap",
                        token: outputMint === "So11111111111111111111111111111111111111112" ? "SOL" : outputMint,
                        amount: outputAmount,
                        from: walletAddress,
                        to: "swap_program", // Placeholder, since it's a swap
                        time,
                        swapDetails,
                    });
                    continue; // Done with this transaction
                }
            }

            // 2. Not a swap, process individual transfers
            // Token Transfers
            let hasTokenTransfer = false;
            for (const diff of diffs) {
                if (diff.mint === "SOL") continue; // Handle SOL below

                hasTokenTransfer = true;
                const isReceived = diff.diff > 0;
                
                // Try to find the counterparty from raw transfers
                let from = isReceived ? "external" : walletAddress;
                let to = isReceived ? walletAddress : "external";
                
                const rawTransfer = myTokenTransfers.find(t => t.mint === diff.mint);
                if (rawTransfer) {
                    from = rawTransfer.fromUserAccount;
                    to = rawTransfer.toUserAccount;
                }

                const tokenIdentifier = diff.mint === "So11111111111111111111111111111111111111112" ? "SOL" : diff.mint;

                formatted.push({
                    signature,
                    type: isReceived ? "received" : "sent",
                    token: tokenIdentifier,
                    amount: Math.abs(diff.diff),
                    from,
                    to,
                    time,
                });
            }

            // 3. Native SOL Transfers
            // Only add SOL transfer if there were no token transfers (to prevent duplicates where SOL is just a fee)
            if (!hasTokenTransfer && Math.abs(solDiff) > 0.0001 && hasMeaningfulSolTransfer) {
                const isReceived = solDiff > 0;
                
                let from = isReceived ? "external" : walletAddress;
                let to = isReceived ? walletAddress : "external";
                
                const rawTransfer = myNativeTransfers[0];
                if (rawTransfer) {
                    from = rawTransfer.fromUserAccount;
                    to = rawTransfer.toUserAccount;
                }

                formatted.push({
                    signature,
                    type: isReceived ? "received" : "sent",
                    token: "SOL",
                    amount: Math.abs(solDiff),
                    from,
                    to,
                    time,
                });
            }

        } catch (error) {
            console.error("Error parsing Helius tx", error, tx);
        }
    }

    return formatted;
}
