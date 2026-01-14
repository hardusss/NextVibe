import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import SolanaService from "@/src/services/SolanaService";
import { FormattedTransaction } from "@/src/types/solana";
import { TOKENS } from "@/constants/Tokens";
import getTokensPrice from "@/src/api/get.tokens.price";

interface UseLastTransactionReturn {
  /** Most recent transaction or null if none */
  lastTransaction: FormattedTransaction | null;
  /** Current price of the transaction token */
  lastTransactionTokenPrice: number;
  /** Loading state for transaction fetch */
  isLoadTransaction: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Function to manually refetch transaction */
  refetch: () => Promise<void>;
}

/**
 * useLastTransaction Hook
 * 
 * Fetches and manages the most recent wallet transaction.
 * Automatically loads on mount and provides manual refetch capability.
 * 
 * Features:
 * - Fetches latest transaction from Solana
 * - Retrieves current token price for USD calculation
 * - Handles loading and error states
 * - Supports manual refresh via refetch function
 * 
 * Error Handling:
 * - Network failures return error message
 * - Missing token data logs warning but continues
 * - Empty transaction history returns null without error
 * 
 * @param connection - Solana RPC connection
 * @param walletPubkey - User's wallet public key
 * @returns Object with transaction data and control functions
 * 
 * @example
 * const { lastTransaction, refetch } = useLastTransaction(connection, pubkey);
 */
export function useLastTransaction(
  connection: Connection | null,
  walletPubkey: PublicKey | null
): UseLastTransactionReturn {
  const [lastTransaction, setLastTransaction] = useState<FormattedTransaction | null>(null);
  const [lastTransactionTokenPrice, setLastTransactionTokenPrice] = useState<number>(0);
  const [isLoadTransaction, setIsLoadTransaction] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches the most recent transaction and its token price
   * Handles all states: loading, success, error, empty
   */
  const fetchTransaction = async () => {
    // Guard: Ensure required dependencies are available
    if (!walletPubkey || !connection) {
      setLastTransaction(null);
      setError(null);
      return;
    }

    setIsLoadTransaction(true);
    setError(null);

    try {
      // Fetch transaction history (limited to 1 for performance)
      const transactions = await SolanaService.getTransactionsHistory(
        connection,
        walletPubkey.toString(),
        true // includeMetadata
      );

      // Handle empty transaction history
      if (!transactions || transactions.length === 0) {
        setLastTransaction(null);
        setLastTransactionTokenPrice(0);
        return;
      }

      const transaction = transactions[0];
      let price = 0;

      // Retrieve token information and price
      const tokenKey = transaction.token as keyof typeof TOKENS;
      const tokenInfo = TOKENS[tokenKey];

      if (tokenInfo) {
        // Map token name to API identifier
        const apiId =
          tokenInfo.name === "USD Coin"
            ? "usd-coin"
            : tokenInfo.name.toLowerCase();

        try {
          const priceData = await getTokensPrice([apiId]);
          price = priceData?.prices[apiId] ?? 0;
        } catch (priceError) {
          // Log but don't fail on price fetch error
          console.warn("Failed to fetch token price:", priceError);
        }
      } else {
        console.warn(`Token ${transaction.token} not found in TOKENS constant`);
      }

      setLastTransactionTokenPrice(price);
      setLastTransaction(transaction);
    } catch (fetchError) {
      console.error("useWalletActivity fetchTransaction error:", fetchError);
      setError("Failed to load activity");
      setLastTransaction(null);
    } finally {
      setIsLoadTransaction(false);
    }
  };

  /**
   * Public refetch function for manual refresh
   * Used by pull-to-refresh and error retry
   */
  const refetch = async () => {
    await fetchTransaction();
  };

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    fetchTransaction();
  }, []);

  return {
    lastTransaction,
    lastTransactionTokenPrice,
    isLoadTransaction,
    error,
    refetch,
  };
}