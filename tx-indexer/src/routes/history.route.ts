import { Elysia, t } from "elysia";
import {
  getSyncCursor,
  insertTransactions,
  mapEnhancedTransaction,
  markSyncCursorDone,
  setSyncCursorStatus,
  upsertSyncCursor,
} from "../db/queries";
import { env } from "../config/env";
import { getEnhancedTransactions } from "../services/helius";
import { isValidSolanaAddress } from "../middleware/internal-auth";
import { checkAndRateLimitWallet } from "../services/bot-detector";
import { shouldKeepTransaction } from "../services/transaction-filter";

export const historyRoutes = new Elysia({ prefix: "/index" }).post(
  "/load-more",
  async ({ body, set }) => {
    const { address, limit = env.LOAD_MORE_DEFAULT_LIMIT } = body;

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
    const cursor = await getSyncCursor(address);

    if (cursor?.status === "done") {
      return {
        loaded: 0,
        has_more: false,
        oldest_signature: cursor.last_signature,
      };
    }

    const before = cursor?.last_signature ?? undefined;

    await setSyncCursorStatus(address, "syncing");

    try {
      const txs = await getEnhancedTransactions(
        address,
        safeLimit,
        before ?? null
      );

      if (txs.length === 0) {
        await markSyncCursorDone(address);
        return {
          loaded: 0,
          has_more: false,
          oldest_signature: cursor?.last_signature ?? null,
        };
      }

      const filteredTxs = txs.filter(tx => shouldKeepTransaction(tx, address));
      const rows = filteredTxs.map((tx) => mapEnhancedTransaction(address, tx, "fetch"));
      const loaded = await insertTransactions(rows);
      const oldestSignature = txs[txs.length - 1]?.signature ?? null;

      await upsertSyncCursor(address, oldestSignature, txs.length);

      const hasMore = txs.length >= safeLimit;
      if (!hasMore) {
        await markSyncCursorDone(address);
      }

      return {
        loaded,
        has_more: hasMore,
        oldest_signature: oldestSignature,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await setSyncCursorStatus(address, "error", message.slice(0, 512));
      set.status = 502;
      return { error: "Failed to load transactions from Helius" };
    }
  },
  {
    body: t.Object({
      address: t.String(),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    }),
  }
);
