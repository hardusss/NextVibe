import { FormattedTransaction, SwapDetails } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";

/**
 * Finds token info from TOKENS constant by mint address or "SOL"
 */
function getTokenInfo(mintOrSymbol: string | null) {
    if (!mintOrSymbol || mintOrSymbol === "SOL") {
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
            
            // 1. Check for SWAP events
            if (tx.type === "SWAP" && tx.events?.swap) {
                const swapEvent = tx.events.swap;
                let inputMint: string | null = null;
                let inputAmount = 0;
                let outputMint: string | null = null;
                let outputAmount = 0;

                // Determine input (what user sent)
                if (swapEvent.nativeInput && swapEvent.nativeInput.account === walletAddress) {
                    inputMint = "SOL";
                    inputAmount = Number(swapEvent.nativeInput.amount) / 1e9;
                } else if (swapEvent.tokenInputs && swapEvent.tokenInputs.length > 0) {
                    const tInput = swapEvent.tokenInputs.find((t: any) => t.userAccount === walletAddress) || swapEvent.tokenInputs[0];
                    inputMint = tInput.mint;
                    inputAmount = tInput.tokenAmount;
                }

                // Determine output (what user received)
                if (swapEvent.nativeOutput && swapEvent.nativeOutput.account === walletAddress) {
                    outputMint = "SOL";
                    outputAmount = Number(swapEvent.nativeOutput.amount) / 1e9;
                } else if (swapEvent.tokenOutputs && swapEvent.tokenOutputs.length > 0) {
                    const tOutput = swapEvent.tokenOutputs.find((t: any) => t.userAccount === walletAddress) || swapEvent.tokenOutputs[0];
                    outputMint = tOutput.mint;
                    outputAmount = tOutput.tokenAmount;
                }

                if (inputMint && outputMint) {
                    const inInfo = getTokenInfo(inputMint);
                    const outInfo = getTokenInfo(outputMint);

                    const swapDetails: SwapDetails = {
                        inputToken: inInfo?.symbol || "Unknown",
                        inputAmount,
                        inputLogoURL: inInfo?.logoURL || null,
                        outputToken: outInfo?.symbol || "Unknown",
                        outputAmount,
                        outputLogoURL: outInfo?.logoURL || null,
                    };

                    formatted.push({
                        signature,
                        type: "swap",
                        token: outputMint === "SOL" ? "SOL" : outputMint,
                        amount: outputAmount,
                        from: walletAddress,
                        to: "swap_program",
                        time,
                        swapDetails,
                    });
                    continue;
                }
            }

            // 2. Check for Token Transfers (SPL)
            if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
                // Find transfer involving our wallet
                const transfer = tx.tokenTransfers.find(
                    (t: any) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress
                );

                if (transfer) {
                    const isReceived = transfer.toUserAccount === walletAddress;
                    formatted.push({
                        signature,
                        type: isReceived ? "received" : "sent",
                        token: transfer.mint,
                        amount: transfer.tokenAmount,
                        from: transfer.fromUserAccount,
                        to: transfer.toUserAccount,
                        time,
                    });
                    continue;
                }
            }

            // 3. Check for Native Transfers (SOL)
            if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
                const transfer = tx.nativeTransfers.find(
                    (t: any) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress
                );

                if (transfer) {
                    const isReceived = transfer.toUserAccount === walletAddress;
                    const amountSol = transfer.amount / 1e9;
                    formatted.push({
                        signature,
                        type: isReceived ? "received" : "sent",
                        token: "SOL",
                        amount: amountSol,
                        from: transfer.fromUserAccount,
                        to: transfer.toUserAccount,
                        time,
                    });
                    continue;
                }
            }
            
            // Other tx types like NFT mints can be added here, but for now we skip them if they don't have transfers
        } catch (error) {
            console.error("Error parsing Helius tx", error, tx);
        }
    }

    return formatted;
}
