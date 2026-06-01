import type { EnhancedTransaction } from "./types";

/**
 * Formats a raw Helius transaction description into a user-friendly push notification message.
 * It replaces the user's wallet address with "You" / "you" and truncates all other Solana addresses.
 *
 * @param tx The transaction from Helius
 * @param walletAddress The current user's wallet address
 * @returns A formatted, readable string
 */
export function formatNotificationMessage(tx: EnhancedTransaction, walletAddress: string): string {
  let message = tx.description;

  if (!message) {
    return "New transaction received";
  }

  try {
    // 1. Replace the user's exact wallet address with a temporary token to avoid regex conflicts
    const tempToken = "__USER_WALLET__";
    message = message.replace(new RegExp(walletAddress, "g"), tempToken);

    // 2. Truncate all other Solana addresses (base58 strings of length 32-44)
    const solanaAddressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
    message = message.replace(solanaAddressRegex, (match) => {
      // Don't truncate common non-addresses that might match, though highly unlikely.
      return `${match.slice(0, 4)}...${match.slice(-4)}`;
    });

    // 3. Replace the temp token with "You" or "you" depending on position
    message = message.replace(new RegExp(tempToken, "g"), (match, offset, fullString) => {
      // If it's the very first word in the sentence, capitalize it.
      if (offset === 0) {
        return "You";
      }
      return "you";
    });

    return message;
  } catch (error) {
    console.error("Error formatting notification message:", error);
    return tx.description || "New transaction received";
  }
}
