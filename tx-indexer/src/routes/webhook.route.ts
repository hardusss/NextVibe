import { Elysia } from "elysia";
import { findMonitoredWalletForTx } from "../db/queries";
import { normalizeWebhookPayload, verifyWebhookAuth } from "../services/helius";
import { enqueueWebhookTx } from "../queue";
import type { EnhancedTransaction } from "../services/types";
import { checkAndRateLimitWallet } from "../services/bot-detector";

export const webhookRoutes = new Elysia({ prefix: "/webhook" }).post(
  "/helius",
  async ({ request, set }) => {
    try {
      const authorization = request.headers.get("authorization");

      if (!verifyWebhookAuth(authorization)) {
        console.warn("[webhook] rejected: invalid Authorization header");
        set.status = 401;
        return { error: "Unauthorized" };
      }

      let parsed: unknown;

      try {
        parsed = await request.json();
      } catch {
        set.status = 400;
        return { error: "Invalid JSON body" };
      }

      let payload: EnhancedTransaction[];

      try {
        payload = normalizeWebhookPayload(parsed);
      } catch (error) {
        set.status = 400;
        return {
          error: error instanceof Error ? error.message : "Invalid webhook payload",
        };
      }

      let queued = 0;
      let skipped = 0;

      for (const tx of payload) {
        try {
          const address = await findMonitoredWalletForTx(tx);
          if (!address) {
            skipped += 1;
            console.warn(
              "[webhook] skipped tx without monitored wallet:",
              tx.signature ?? "unknown"
            );
            continue;
          }

          const isBot = await checkAndRateLimitWallet(address);
          if (isBot) {
            skipped += 1;
            console.warn(`[webhook] skipped tx for bot wallet: ${address}`);
            continue;
          }

          await enqueueWebhookTx(address, tx as unknown as Record<string, unknown>);
          queued += 1;
        } catch (error) {
          console.error(
            "[webhook] failed to queue tx:",
            tx.signature ?? "unknown",
            error
          );
        }
      }

      console.log(
        `[webhook] received ${payload.length} tx(s), queued ${queued}, skipped ${skipped}`
      );

      return { ok: true, queued, skipped };
    } catch (error) {
      console.error("[webhook] unhandled error:", error);
      set.status = 500;
      return { error: "Internal server error" };
    }
  },
  {
    parse: "none",
  }
);
