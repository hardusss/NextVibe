import { LAMPORTS_PER_SOL, ParsedTransactionWithMeta } from "@solana/web3.js";
import { TOKEN_MINT_CONSTANTS } from "@/constants/Tokens";
import { FormattedTransaction } from "@/src/types/solana";

// Threshold to filter out rent/fee noise (< 0.000005 SOL)
const MIN_SOL_CHANGE = 5000; 

/**
 * Extracts real addresses from SystemProgram instructions.
 * Necessary because the main tx object doesn't explicitly link "source" and "destination"
 * in a way that's easy to read for the UI.
 */
const extractSOLAddresses = (
    tx: ParsedTransactionWithMeta
): { from: string; to: string } | null => {
    const instructions = tx.transaction.message.instructions;
    
    // Find the specific 'transfer' instruction to get real addresses
    const transferIx = instructions.find((ix: any) => 
        ix.parsed?.type === 'transfer' && ix.program === 'system'
    );

    if (!transferIx) return null;

    const info = (transferIx as any).parsed.info;
    return {
        from: info.source || "external",
        to: info.destination || "external"
    };
};

/**
 * Determines transaction direction and addresses for SPL tokens.
 * Complex logic needed to match balance changes with specific account owners.
 */
const extractTokenAddresses = (
    tx: ParsedTransactionWithMeta,
    accountAddress: string,
    tokenAccountIndex: number,
    preTokenBalances: any[],
    postTokenBalances: any[]
): { from: string; to: string } | null => {
    const instructions = tx.transaction.message.instructions;

    // Find the transfer instruction corresponding to this token movement
    const transferIx = instructions.find((ix: any) => 
        (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') && 
        ix.program === 'spl-token'
    );

    if (!transferIx) return null;
    const info = (transferIx as any).parsed.info;

    // Check balances to see who owned the account before the tx
    const preBalance = preTokenBalances.find(b => b.accountIndex === tokenAccountIndex);
    const postBalance = postTokenBalances.find(b => b.accountIndex === tokenAccountIndex);

    // Determine if we are the sender
    const isSource = info.source && (
        preBalance?.owner === accountAddress || 
        info.authority === accountAddress
    );

    if (isSource) {
        return {
            from: accountAddress,
            to: postBalance?.owner || info.destination || "external"
        };
    } else {
        return {
            from: preBalance?.owner || info.source || "external",
            to: accountAddress
        };
    }
};

/**
 * Main parser function.
 * Converts raw RPC transactions into a clean UI format.
 */
export const formatTransactions = (
    accountAddress: string,
    transactions: ParsedTransactionWithMeta[]
): FormattedTransaction[] => {
    const result: FormattedTransaction[] = [];

    for (const tx of transactions) {
        if (!tx.meta || !tx.transaction) continue;

        const signature = tx.transaction.signatures[0];
        const time = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
        const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());

        // --- 1. SOL Transfers ---
        const myIndex = accountKeys.indexOf(accountAddress);
        if (myIndex !== -1) {
            const pre = tx.meta.preBalances[myIndex] ?? 0;
            const post = tx.meta.postBalances[myIndex] ?? 0;
            const diff = post - pre;

            // Only show significant transfers, ignore fees
            if (Math.abs(diff) > MIN_SOL_CHANGE) {
                const diffSOL = diff / LAMPORTS_PER_SOL;
                const addresses = extractSOLAddresses(tx);

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

        // --- 2. Token Transfers ---
        const preTokens = tx.meta.preTokenBalances ?? [];
        const postTokens = tx.meta.postTokenBalances ?? [];

        for (const post of postTokens) {
            // Process only tokens owned by the current user
            if (post.owner !== accountAddress) continue;

            const pre = preTokens.find(p => p.accountIndex === post.accountIndex);
            const diff = (post.uiTokenAmount.uiAmount || 0) - (pre?.uiTokenAmount.uiAmount || 0);

            if (diff === 0) continue;

            const addresses = extractTokenAddresses(
                tx, accountAddress, post.accountIndex, preTokens, postTokens
            );

            result.push({
                signature,
                type: diff > 0 ? "received" : "sent",
                token: post.mint === TOKEN_MINT_CONSTANTS.USDC_MINT ? "USDC" : post.mint,
                amount: Math.abs(diff),
                from: addresses?.from || (diff > 0 ? "external" : accountAddress),
                to: addresses?.to || (diff > 0 ? accountAddress : "external"),
                time,
            });
        }
    }

    return result;
};