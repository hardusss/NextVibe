import { 
    Connection, 
    PublicKey, 
    LAMPORTS_PER_SOL, 
    type SignaturesForAddressOptions,
    type ParsedTransactionWithMeta
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TOKEN_MINT_CONSTANTS } from "@/constants/Tokens";

export type FormattedTransaction = {
  signature: string;
  type: "sent" | "received";
  token: string;        // "SOL" or SPL mint
  amount: number;
  from: string;
  to: string;
  time: Date | null;
};

/**
 * Extracts real sender/receiver addresses from SOL transfer instructions
 * Parses SystemProgram transfer instruction to find actual counterparty
 * 
 * @param tx - Parsed transaction with metadata
 * @param accountAddress - Current wallet address
 * @returns Object with from/to addresses or null if not found
 */
const extractSOLTransferAddresses = (
  tx: ParsedTransactionWithMeta,
  accountAddress: string
): { from: string; to: string } | null => {
  const instructions = tx.transaction.message.instructions;
  
  for (const instruction of instructions) {
    // Check if this is a parsed instruction with program "system"
    if ('parsed' in instruction && instruction.program === 'system') {
      const parsed = instruction.parsed;
      
      // Check for "transfer" type instruction
      if (parsed.type === 'transfer') {
        const info = parsed.info;
        return {
          from: info.source || "external",
          to: info.destination || "external"
        };
      }
    }
  }
  
  return null;
};

/**
 * Extracts real sender/receiver addresses from SPL token transfer
 * Parses token program instructions and resolves token account owners
 * 
 * @param tx - Parsed transaction with metadata
 * @param accountAddress - Current wallet address
 * @param tokenAccountIndex - Index of the token account in transaction
 * @returns Object with from/to addresses or null if not found
 */
const extractTokenTransferAddresses = (
  tx: ParsedTransactionWithMeta,
  accountAddress: string,
  tokenAccountIndex: number
): { from: string; to: string } | null => {
  const instructions = tx.transaction.message.instructions;
  const preTokenBalances = tx.meta?.preTokenBalances ?? [];
  const postTokenBalances = tx.meta?.postTokenBalances ?? [];
  
  for (const instruction of instructions) {
    // Check for SPL token transfer instruction
    if ('parsed' in instruction && instruction.program === 'spl-token') {
      const parsed = instruction.parsed;
      
      // Handle different token instruction types
      if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
        const info = parsed.info;
        
        // Find the corresponding pre and post balances
        const preBalance = preTokenBalances.find(
          b => b.accountIndex === tokenAccountIndex
        );
        const postBalance = postTokenBalances.find(
          b => b.accountIndex === tokenAccountIndex
        );
        
        // Determine if we're the source or destination
        const isSource = info.source && 
          (preBalance?.owner === accountAddress || info.authority === accountAddress);
        
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
      }
    }
  }
  
  return null;
};

/**
 * Formats raw Solana transactions into user-friendly transaction objects
 * Extracts real addresses instead of using "external" placeholder
 * 
 * @param accountAddress - User's wallet address
 * @param transactions - Array of parsed Solana transactions
 * @returns Formatted transaction array with real sender/receiver addresses
 */
export const formatedTransaction = (
  accountAddress: string,
  transactions: ParsedTransactionWithMeta[]
): FormattedTransaction[] => {
  const result: FormattedTransaction[] = [];

  for (const tx of transactions) {
    if (!tx.meta || !tx.transaction) continue;

    const signature = tx.transaction.signatures[0];
    const time = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
    
    // Get account keys for balance checking
    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());

    /* =========================
       1️⃣ SOL TRANSFER
    ========================= */
    const myIndex = accountKeys.indexOf(accountAddress);
    if (myIndex !== -1) {
      const preLamports = tx.meta.preBalances[myIndex] ?? 0;
      const postLamports = tx.meta.postBalances[myIndex] ?? 0;
      const diffLamports = postLamports - preLamports;

      // Filter micro-changes (fees) - only show actual transfers
      if (Math.abs(diffLamports) > 5000) { 
        const diffSOL = diffLamports / LAMPORTS_PER_SOL;
        
        // Extract real addresses from transaction instructions
        const addresses = extractSOLTransferAddresses(tx, accountAddress);
        
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

    /* =========================
       2️⃣ SPL TOKEN TRANSFER (USDC etc.)
    ========================= */
    const preTokens = tx.meta.preTokenBalances ?? [];
    const postTokens = tx.meta.postTokenBalances ?? [];

    for (const post of postTokens) {
      // Check if current user owns this token account
      if (post.owner !== accountAddress) continue;

      const pre = preTokens.find(p => p.accountIndex === post.accountIndex);
      const preAmount = Number(pre?.uiTokenAmount.uiAmount ?? 0);
      const postAmount = Number(post.uiTokenAmount.uiAmount ?? 0);
      const diff = postAmount - preAmount;

      if (diff === 0) continue;

      // Extract real addresses from token transfer instruction
      const addresses = extractTokenTransferAddresses(tx, accountAddress, post.accountIndex);

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

export default class SolanaService {
    /**
     * Fetches SOL balance for a given wallet address
     * 
     * @param connection - Solana RPC connection
     * @param walletAddress - Wallet public key as string
     * @returns SOL balance or 0 on error
     */
    static async getSolBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const publicKey = new PublicKey(walletAddress);
            const lamports = await connection.getBalance(publicKey);
            const balance = lamports / LAMPORTS_PER_SOL;

            return balance;
        } catch (error: any) {
            console.warn('[SolanaService] Error fetching SOL:', error);
            return 0;
        }
    }

    /**
     * Fetches USDC balance from SPL token accounts
     * 
     * @param connection - Solana RPC connection
     * @param walletAddress - Wallet public key as string
     * @returns USDC balance or 0 on error
     */
    static async getUsdcBalance(connection: Connection, walletAddress: string): Promise<number> {
        try {
            const pubkey = new PublicKey(walletAddress);

            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
                programId: TOKEN_PROGRAM_ID,
            });
 
            const usdcAccount = tokenAccounts.value.find((item) => 
                item.account.data.parsed.info.mint === TOKEN_MINT_CONSTANTS.USDC_MINT
            );

            if (usdcAccount) {
                return usdcAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
            }

            return 0;

        } catch (error) {
            console.warn('[SolanaService] Error fetching USDC:', error);
            return 0;
        }
    }

    /**
     * Fetches transaction history with pagination support
     * Uses cursor-based pagination via lastSignature parameter
     * 
     * @param connection - Solana RPC connection
     * @param walletAddress - Wallet public key as string
     * @param isLastTransaction - If true, returns only 1 transaction
     * @param lastSignature - Cursor for pagination (fetch transactions before this)
     * @returns Array of formatted transactions or null on error
     */
    static async getTransactionsHistory(
        connection: Connection,
        walletAddress: string,
        isLastTransaction: boolean,
        lastSignature?: string
    ): Promise<FormattedTransaction[] | null> {
        try {
            const signaturesOptions: SignaturesForAddressOptions = {
                limit: isLastTransaction ? 1 : 5,
            };
            
            if (lastSignature) {
                signaturesOptions.before = lastSignature;
            }

            const address = new PublicKey(walletAddress);
            const signatures = await connection.getSignaturesForAddress(
                address,
                signaturesOptions,
            );

            if (signatures.length === 0) {
                return [];
            }

            // Fetch full transaction data for each signature
            const transactionSignatures = signatures.map(sig => sig.signature);
            const txs = await Promise.all(
                transactionSignatures.map(sig =>
                    connection.getParsedTransaction(sig, {
                        maxSupportedTransactionVersion: 0,
                        commitment: "confirmed",
                    })
                )
            );

            // Filter out null transactions (failed to fetch)
            const transactions = txs.filter(
                (tx): tx is ParsedTransactionWithMeta => tx !== null
            );

            // Format transactions with real addresses
            const formatted = formatedTransaction(walletAddress, transactions);
            
            return formatted;
        } catch (error) {
            console.error('[SolanaService] Error fetching transaction history:', error);
            return null;
        }
    }
}