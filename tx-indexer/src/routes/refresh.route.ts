import { Elysia, t } from "elysia";
import {
  insertTransactions,
  mapEnhancedTransaction,
} from "../db/queries";
import { getEnhancedTransactions } from "../services/helius";
import { isValidSolanaAddress } from "../middleware/internal-auth";
import { checkAndRateLimitWallet } from "../services/bot-detector";
import { shouldKeepTransaction } from "../services/transaction-filter";

/**
 * Refresh route: fetches the latest N transactions from Helius
 * (without any "before" cursor) and upserts them into the DB.
 *
 * Existing transactions (same signature) are skipped via INSERT IGNORE,
 * so only genuinely new ones are added.
 */
export const refreshRoutes = new Elysia({ prefix: "/index" }).post(
  "/refresh-latest",
  async ({ body, set }) => {
    const { address, limit = 20 } = body;

    if (!isValidSolanaAddress(address)) {
      set.status = 400;
      return { error: "Invalid wallet address" };
    }

    const isBot = await checkAndRateLimitWallet(address);
    if (isBot) {
      set.status = 429;
      return { error: "Too many requests. Wallet blacklisted." };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    try {
      // Fetch from Helius WITHOUT a "before" cursor → gets the most recent txs
      const txs = await getEnhancedTransactions(address, safeLimit, null);

      if (txs.length === 0) {
        return { loaded: 0, fetched: 0 };
      }

      const filteredTxs = txs.filter((tx) =>
        shouldKeepTransaction(tx, address)
      );
      const rows = filteredTxs.map((tx) =>
        mapEnhancedTransaction(address, tx, "fetch")
      );
      const loaded = await insertTransactions(rows);

      return {
        loaded,          // newly inserted (skips duplicates)
        fetched: txs.length, // total fetched from Helius
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[refresh-latest] failed for ${address}: ${message}`);
      set.status = 502;
      return { error: "Failed to refresh transactions from Helius" };
    }
  },
  {
    body: t.Object({
      address: t.String(),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    }),
  }
);
