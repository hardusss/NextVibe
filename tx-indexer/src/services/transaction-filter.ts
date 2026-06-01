import { ALLOWED_MINTS, MIN_SOL_LAMPORTS } from "../config/tokens";
import type { EnhancedTransaction } from "./types";

/**
 * Determines if a transaction should be saved based on:
 * 1. Has native SOL transfers above the dust threshold (e.g. >= 0.00005 SOL)
 * 2. Has token transfers for whitelisted mints
 * 3. Is a meaningful interaction for the tracked wallet (e.g., SWAP, NFT_MINT)
 */
export function shouldKeepTransaction(tx: EnhancedTransaction, walletAddress: string): boolean {
  let hasMeaningfulAction = false;

  // 1. Check Native Transfers (SOL)
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    for (const transfer of tx.nativeTransfers) {
      // Check if it involves our tracked wallet
      if (transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress) {
        if (transfer.amount >= MIN_SOL_LAMPORTS) {
          hasMeaningfulAction = true;
          break;
        }
      }
    }
  }

  // 2. Check Token Transfers (SPL)
  if (!hasMeaningfulAction && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress) {
        if (ALLOWED_MINTS.has(transfer.mint)) {
          // We can also check for SPL dust if needed, but for now matching the mint is sufficient
          hasMeaningfulAction = true;
          break;
        }
      }
    }
  }

  // 3. Keep specific transaction types even if transfers are masked (like NFT mints)
  if (!hasMeaningfulAction) {
    const keepTypes = ["NFT_MINT", "COMPRESSED_NFT_MINT"];
    if (tx.type && keepTypes.includes(tx.type)) {
      hasMeaningfulAction = true;
    }
  }

  return hasMeaningfulAction;
}
