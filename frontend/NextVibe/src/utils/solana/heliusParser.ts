import { FormattedTransaction, NftDetails, SwapDetails } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";

// SPL Memo program ids (v2 and v1)
const MEMO_PROGRAM_IDS = [
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
];

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decodes a base58 string to bytes. Returns null on invalid input.
 */
function base58Decode(str: string): Uint8Array | null {
    if (!str) return null;
    const bytes: number[] = [0];
    for (const char of str) {
        const value = BASE58_ALPHABET.indexOf(char);
        if (value === -1) return null;
        let carry = value;
        for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    // Leading '1's encode leading zero bytes
    for (const char of str) {
        if (char !== "1") break;
        bytes.push(0);
    }
    return Uint8Array.from(bytes.reverse());
}

/**
 * Minimal UTF-8 decoder (Hermes may lack TextDecoder).
 */
function utf8Decode(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; ) {
        const b = bytes[i];
        if (b < 0x80) {
            out += String.fromCharCode(b);
            i += 1;
        } else if (b < 0xe0) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 2;
        } else if (b < 0xf0) {
            out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 3;
        } else {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            out += String.fromCodePoint(cp);
            i += 4;
        }
    }
    return out;
}

/**
 * True when the string is readable text (no control characters).
 */
function isPrintableText(str: string): boolean {
    if (!str) return false;
    let printable = 0;
    for (const char of str) {
        const code = char.codePointAt(0)!;
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127 && (code < 0x80 || code > 0x9f))) {
            printable++;
        }
    }
    return printable / [...str].length > 0.9;
}

/**
 * Extracts the SPL Memo text from a Helius enhanced transaction, if present.
 * Helius encodes instruction data as base58 or raw utf-8 depending on version,
 * so both are handled.
 */
export function extractMemo(tx: any): string | null {
    const instructions: any[] = [
        ...(tx.instructions ?? []),
        ...(tx.instructions ?? []).flatMap((ix: any) => ix.innerInstructions ?? []),
    ];
    for (const ix of instructions) {
        if (!MEMO_PROGRAM_IDS.includes(ix?.programId) || typeof ix?.data !== "string") continue;
        const decoded = base58Decode(ix.data);
        if (decoded && decoded.length > 0) {
            const text = utf8Decode(decoded);
            if (isPrintableText(text)) return text;
        }
        if (isPrintableText(ix.data)) return ix.data;
    }
    return null;
}

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

            // 0. Compressed NFT events (Bubblegum mint / transfer / burn).
            // These move no SOL and no SPL tokens for the user, so they must be
            // handled before the balance-diff branches below.
            const compressed: any[] = tx.events?.compressed ?? [];
            const myCompressed = compressed.filter(
                e => e && (e.newLeafOwner === walletAddress || e.oldLeafOwner === walletAddress)
            );
            if (myCompressed.length > 0) {
                const memo = extractMemo(tx);
                for (const e of myCompressed) {
                    const incoming = e.newLeafOwner === walletAddress;
                    const kind: NftDetails["kind"] =
                        e.type === "COMPRESSED_NFT_MINT" ? "claimed" :
                        e.type === "COMPRESSED_NFT_BURN" ? "burned" :
                        incoming ? "received" : "sent";
                    formatted.push({
                        signature,
                        type: incoming ? "received" : "sent",
                        token: "cNFT",
                        amount: 1,
                        from: incoming ? (e.oldLeafOwner ?? "external") : walletAddress,
                        to: incoming ? walletAddress : (e.newLeafOwner ?? "external"),
                        time,
                        nft: {
                            assetId: e.assetId,
                            name: e.metadata?.name ?? null,
                            uri: e.metadata?.uri ?? null,
                            kind,
                            memo,
                        },
                        fee: tx.feePayer === walletAddress ? (tx.fee ?? 0) / 1e9 : 0,
                    });
                }
                continue;
            }

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
