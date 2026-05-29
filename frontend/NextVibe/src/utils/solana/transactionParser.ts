import { LAMPORTS_PER_SOL, ParsedTransactionWithMeta } from "@solana/web3.js";
import { TOKEN_MINT_CONSTANTS } from "@/constants/Tokens";
import { FormattedTransaction } from "@/src/types/solana";

/**
 * Minimum amount of Lamports change to consider a transaction valid.
 * Filters out rent-exempt adjustments and dust.
 * 0.000005 SOL
 */
const MIN_SOL_CHANGE = 5000; 

/**
 * Known program IDs for cNFT operations (Bubblegum / Compression).
 */
const BUBBLEGUM_PROGRAM_ID = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752kRSfkm";
const SPL_NOOP_PROGRAM_ID = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
const SPL_ACCOUNT_COMPRESSION_ID = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";

/**
 * Helper to resolve the counterparty address for native SOL transfers.
 * 🔥 UPDATED: Now scans Inner Instructions (CPI) for Smart Wallets.
 */
const extractSOLAddresses = (
    tx: ParsedTransactionWithMeta,
    myAddress: string
): { from: string; to: string } | null => {
    
    // 1. Collect ALL instructions (Top-level + Inner)
    // Smart wallets execute transfers inside innerInstructions.
    let allInstructions: any[] = [...tx.transaction.message.instructions];
    
    if (tx.meta?.innerInstructions) {
        tx.meta.innerInstructions.forEach(inner => {
            allInstructions = [...allInstructions, ...inner.instructions];
        });
    }

    // 2. Find the specific SystemProgram.transfer
    // We look for a transfer where either Source or Destination is us.
    const transferIx = allInstructions.find((ix: any) => {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
            const info = ix.parsed.info;
            return info.source === myAddress || info.destination === myAddress;
        }
        return false;
    });

    if (transferIx) {
        return {
            from: transferIx.parsed.info.source,
            to: transferIx.parsed.info.destination
        };
    }

    // 3. Fallback: Balance Change Analysis
    // If instruction parsing fails, use balance diffs.
    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];

    const myIndex = accountKeys.indexOf(myAddress);
    if (myIndex === -1) return { from: "external", to: "external" };

    const myDiff = (postBalances[myIndex] - preBalances[myIndex]);
    
    // Attempt to guess the counterparty based on max balance change
    let counterparty = "external";
    let maxChange = MIN_SOL_CHANGE;

    if (myDiff < 0) {
        // SENT: Find who received money (max increase)
        for (let i = 0; i < accountKeys.length; i++) {
            if (i === myIndex) continue;
            const diff = postBalances[i] - preBalances[i];
            if (diff > maxChange) {
                maxChange = diff;
                counterparty = accountKeys[i];
            }
        }
        return { from: myAddress, to: counterparty };
    } else {
        // RECEIVED: Find who sent money (max decrease)
        for (let i = 0; i < accountKeys.length; i++) {
            if (i === myIndex) continue;
            const diff = postBalances[i] - preBalances[i];
            // diff is negative for sender
            if (diff < 0 && Math.abs(diff) > maxChange) {
                maxChange = Math.abs(diff);
                counterparty = accountKeys[i];
            }
        }
        return { from: counterparty, to: myAddress };
    }
};

/**
 * Helper to resolve counterparty addresses for SPL Token transfers.
 * 🔥 UPDATED: Also scans Inner Instructions and correctly resolves Owners.
 */
const extractTokenAddresses = (
    tx: ParsedTransactionWithMeta,
    accountAddress: string,
    tokenAccountIndex: number,
    preTokenBalances: any[],
    postTokenBalances: any[]
): { from: string; to: string } | null => {
    
    // 1. Collect ALL instructions (Top + Inner)
    let allInstructions: any[] = [...tx.transaction.message.instructions];
    if (tx.meta?.innerInstructions) {
        tx.meta.innerInstructions.forEach(inner => {
            allInstructions = [...allInstructions, ...inner.instructions];
        });
    }

    // 2. Find the SPL transfer instruction related to this transaction
    // We look for 'transfer' or 'transferChecked'
    const transferIx = allInstructions.find((ix: any) => 
        (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') && 
        ix.program === 'spl-token'
    );

    if (!transferIx) {
        // Fallback logic if specific instruction isn't found
        return { from: "external", to: "external" };
    }

    const info = (transferIx as any).parsed.info;
    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());

    // 3. Resolve Owners
    // The instruction gives us Token Accounts (source/destination).
    // We need to find the Wallet Address (Owner) of those token accounts.
    
    const resolveOwner = (tokenAccountAddr: string): string | null => {
        // Try finding in preTokenBalances
        const pre = preTokenBalances.find(b => {
            // Balance objects utilize accountIndex, need to map to address
            return accountKeys[b.accountIndex] === tokenAccountAddr;
        });
        if (pre?.owner) return pre.owner;

        // Try finding in postTokenBalances
        const post = postTokenBalances.find(b => {
            return accountKeys[b.accountIndex] === tokenAccountAddr;
        });
        if (post?.owner) return post.owner;

        return null;
    };

    const sourceOwner = resolveOwner(info.source);
    const destOwner = resolveOwner(info.destination);

    // Check if we are the sender
    // For Smart Wallets, info.authority is often the Wallet Address
    const isSender = (sourceOwner === accountAddress) || (info.authority === accountAddress);

    if (isSender) {
        return {
            from: accountAddress,
            // If we can't find dest owner, fallback to dest token account address
            to: destOwner || info.destination || "external"
        };
    } else {
        return {
            from: sourceOwner || info.source || "external",
            to: accountAddress
        };
    }
};

/**
 * Detects if a transaction involves cNFT operations (mint, transfer, burn)
 * via the Bubblegum or Account Compression programs.
 */
const detectCNftTransaction = (
    tx: ParsedTransactionWithMeta,
    myAddress: string
): FormattedTransaction | null => {
    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
    const signature = tx.transaction.signatures[0];
    const time = tx.blockTime ? new Date(tx.blockTime * 1000) : null;

    // Check if any account key is the Bubblegum program
    const hasBubblegum = accountKeys.includes(BUBBLEGUM_PROGRAM_ID);
    const hasCompression = accountKeys.includes(SPL_ACCOUNT_COMPRESSION_ID);

    if (!hasBubblegum && !hasCompression) return null;

    // Collect all instructions (top-level + inner)
    let allInstructions: any[] = [...tx.transaction.message.instructions];
    if (tx.meta?.innerInstructions) {
        tx.meta.innerInstructions.forEach(inner => {
            allInstructions = [...allInstructions, ...inner.instructions];
        });
    }

    // Look for Bubblegum instructions in the log messages for more detail
    const logs = tx.meta?.logMessages || [];

    // Detect cNFT Mint (MintV1 / MintToCollectionV1)
    const isMint = logs.some(log =>
        log.includes("Instruction: MintV1") ||
        log.includes("Instruction: MintToCollectionV1")
    );

    // Detect cNFT Transfer
    const isTransfer = logs.some(log =>
        log.includes("Instruction: Transfer")
    ) && hasBubblegum;

    // Detect cNFT Burn
    const isBurn = logs.some(log =>
        log.includes("Instruction: Burn")
    ) && hasBubblegum;

    if (isMint) {
        // Determine if we are the tree authority / payer (we minted)
        // or if it was minted TO us
        // The payer (first signer) is typically accountKeys[0]
        const payer = accountKeys[0];
        const isMinter = payer === myAddress;

        return {
            signature,
            type: isMinter ? "sent" : "received",
            token: "cNFT",
            amount: 1,
            from: isMinter ? myAddress : payer,
            to: isMinter ? "Collection" : myAddress,
            time,
        };
    }

    if (isTransfer) {
        // For cNFT transfers, try to determine direction from SOL balance changes
        // The new leaf owner typically pays for the transaction
        const myIndex = accountKeys.indexOf(myAddress);
        if (myIndex !== -1) {
            const pre = tx.meta?.preBalances?.[myIndex] ?? 0;
            const post = tx.meta?.postBalances?.[myIndex] ?? 0;
            const diff = post - pre;

            // If our balance decreased, we sent (paid fees to transfer)
            // If balance stayed same or increased, we received
            return {
                signature,
                type: diff < -MIN_SOL_CHANGE ? "sent" : "received",
                token: "cNFT",
                amount: 1,
                from: diff < -MIN_SOL_CHANGE ? myAddress : "external",
                to: diff < -MIN_SOL_CHANGE ? "external" : myAddress,
                time,
            };
        }
    }

    if (isBurn) {
        return {
            signature,
            type: "sent",
            token: "cNFT",
            amount: 1,
            from: myAddress,
            to: "Burned",
            time,
        };
    }

    // Generic cNFT interaction we can't classify further
    // Still show it rather than hide it
    return {
        signature,
        type: "received",
        token: "cNFT",
        amount: 1,
        from: "external",
        to: myAddress,
        time,
    };
};

/**
 * Main parser function.
 * Converts raw RPC transactions into a clean UI format.
 * 
 * Deduplication: Uses a Set to track signatures that have already been
 * added, preventing the same transaction from appearing twice (e.g. when
 * a tx has both a SOL fee change AND an SPL transfer).
 */
export const formatTransactions = (
    accountAddress: string,
    transactions: ParsedTransactionWithMeta[]
): FormattedTransaction[] => {
    const result: FormattedTransaction[] = [];
    /** Track processed signatures to prevent duplicates */
    const seenSignatures = new Set<string>();

    for (const tx of transactions) {
        if (!tx.meta || !tx.transaction) continue;
        if (tx.meta.err) continue; // Skip failed transactions

        const signature = tx.transaction.signatures[0];
        const time = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
        const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());

        // --- 0. cNFT Transactions (Bubblegum) ---
        // Check first because cNFT txs also have SOL balance changes (fees)
        // and we don't want to double-count them.
        const cnftResult = detectCNftTransaction(tx, accountAddress);
        if (cnftResult) {
            if (!seenSignatures.has(signature)) {
                seenSignatures.add(signature);
                result.push(cnftResult);
            }
            continue; // Skip SOL/SPL parsing for this tx
        }

        // --- 1. Token Transfers (check first, more specific) ---
        const preTokens = tx.meta.preTokenBalances ?? [];
        const postTokens = tx.meta.postTokenBalances ?? [];
        let hasTokenTransfer = false;

        for (const post of postTokens) {
            // Only process tokens owned by the current user
            if (post.owner !== accountAddress) continue;

            const pre = preTokens.find(p => p.accountIndex === post.accountIndex);
            const diff = (post.uiTokenAmount.uiAmount || 0) - (pre?.uiTokenAmount.uiAmount || 0);

            if (Math.abs(diff) === 0) continue;

            // Skip if we already have this signature (prevents duplication)
            if (seenSignatures.has(signature)) continue;

            const addresses = extractTokenAddresses(
                tx, accountAddress, post.accountIndex, preTokens, postTokens
            );

            // Determine Token Symbol
            const tokenSymbol = post.mint === TOKEN_MINT_CONSTANTS.USDC_MINT ? "USDC" : post.mint;

            seenSignatures.add(signature);
            hasTokenTransfer = true;

            result.push({
                signature,
                type: diff > 0 ? "received" : "sent",
                token: tokenSymbol,
                amount: Math.abs(diff),
                from: addresses?.from || (diff > 0 ? "external" : accountAddress),
                to: addresses?.to || (diff > 0 ? accountAddress : "external"),
                time,
            });
        }

        // --- 2. SOL Transfers ---
        // Only add if no token transfer was found for this signature
        // This prevents duplicates where a token transfer also has a SOL fee change
        if (hasTokenTransfer) continue;

        const myIndex = accountKeys.indexOf(accountAddress);
        if (myIndex !== -1) {
            const pre = tx.meta.preBalances[myIndex] ?? 0;
            const post = tx.meta.postBalances[myIndex] ?? 0;
            const diff = post - pre;

            // Check absolute difference to catch both Send and Receive
            if (Math.abs(diff) > MIN_SOL_CHANGE) {
                if (seenSignatures.has(signature)) continue;

                const diffSOL = diff / LAMPORTS_PER_SOL;
                const addresses = extractSOLAddresses(tx, accountAddress);
                if (addresses?.from === addresses?.to) {
                    continue; 
                }
                seenSignatures.add(signature);
                result.push({
                    signature,
                    type: diffSOL > 0 ? "received" : "sent",
                    token: "SOL",
                    amount: Math.abs(diffSOL),
                    from: addresses?.from || (diffSOL > 0 ? "external" : accountAddress),
                    to: addresses?.to || (diffSOL > 0 ? accountAddress : "external"),
                    time,
                });
            }
        }
    }

    return result;
};