import { ALLOWED_MINTS, MIN_SOL_LAMPORTS } from "../config/tokens";
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
  if (!involvesWallet) {
    return false;
  }

  let hasMeaningfulAction = false;

  // 3. Check Native Transfers (SOL) above dust threshold
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    for (const transfer of tx.nativeTransfers) {
      if (
        (transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress) &&
        transfer.amount >= MIN_SOL_LAMPORTS
      ) {
        hasMeaningfulAction = true;
        break;
      }
    }
  }

  // 4. Check Token Transfers (SPL) for whitelisted mints
  if (!hasMeaningfulAction && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress) {
        if (ALLOWED_MINTS.has(transfer.mint)) {
          hasMeaningfulAction = true;
          break;
        }
      }
    }
  }

  // 5. Keep specific transaction types even if transfers are masked
  if (!hasMeaningfulAction) {
    const keepTypes = ["NFT_MINT", "COMPRESSED_NFT_MINT", "NFT_SALE", "NFT_BUY", "SWAP"];
    if (tx.type && keepTypes.includes(tx.type)) {
      hasMeaningfulAction = true;
    }
  }

  return hasMeaningfulAction;
}
