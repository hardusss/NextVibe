import { Elysia, t } from "elysia";
import { countAllTransactions, countTransactionsByAddress } from "../db/queries";
import { enqueueFetchInitial } from "../queue";
import { runInitialSync } from "../cron/initial-sync";
import { addAddressToWebhook, getWebhook } from "../services/webhook-manager";
import { env } from "../config/env";
import { internalAuthGuard, isValidSolanaAddress } from "../middleware/internal-auth";

export const indexRoutes = new Elysia({ prefix: "/index" })
  .post(
    "/register",
    async ({ body, headers, set }) => {
      try {
        internalAuthGuard(headers);
      } catch {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { wallet_address: walletAddress } = body;

      if (!walletAddress) {
        return { status: "skipped" as const };
      }

      if (!isValidSolanaAddress(walletAddress)) {
        set.status = 400;
        return { error: "Invalid wallet address" };
      }

      const existingCount = await countTransactionsByAddress(walletAddress);
      if (existingCount > 0) {
        await addAddressToWebhook(walletAddress).catch((error) => {
          console.warn(
            `[register] webhook update failed for ${walletAddress}:`,
            error
          );
        });

        return { status: "already_indexed" as const };
      }

      await enqueueFetchInitial(walletAddress, env.INITIAL_FETCH_LIMIT);
      await addAddressToWebhook(walletAddress);

      return { status: "queued" as const };
    },
    {
      body: t.Object({
        wallet_address: t.Optional(t.String()),
        user_id: t.Optional(t.Number()),
      }),
    }
  )
  .post(
    "/sync-all",
    async ({ body, headers, set }) => {
      try {
        internalAuthGuard(headers);
      } catch {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const force = body?.force ?? false;
      const result = await runInitialSync({ force });

      return {
        status: "ok" as const,
        force,
        ...result,
      };
    },
    {
      body: t.Object({
        force: t.Optional(t.Boolean()),
      }),
    }
  )
  .get("/status", async ({ headers, set }) => {
    try {
      internalAuthGuard(headers);
    } catch {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const [transactionCount, webhook] = await Promise.all([
      countAllTransactions(),
      getWebhook().catch(() => null),
    ]);

    return {
      transactions: transactionCount,
      webhookAddresses: webhook?.accountAddresses?.length ?? null,
      webhookUrl: webhook?.webhookURL ?? null,
    };
  });
