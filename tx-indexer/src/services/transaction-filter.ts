import type { EnhancedTransaction } from "./types";

/**
 * Determines if a transaction should be saved based on:
 * 1. Has native SOL transfers above the dust threshold (e.g. >= 0.00005 SOL)
 * 2. Has token transfers for whitelisted mints
 * 3. Is a meaningful interaction for the tracked wallet (e.g., SWAP, NFT_MINT)
 */
export function shouldKeepTransaction(tx: EnhancedTransaction, walletAddress: string): boolean {
  // 1. Skip failed transactions
  if (tx.transactionError) {
    return false;
  }

  // 2. Ensure the transaction actually involves the wallet address
  const involvesWallet = (tx.accountData && tx.accountData.some(a => a.account === walletAddress)) || tx.feePayer === walletAddress;
  return !!involvesWallet;
}
