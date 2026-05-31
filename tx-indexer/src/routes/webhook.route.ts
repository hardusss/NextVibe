import { Elysia } from "elysia";
import { findMonitoredWalletForTx } from "../db/queries";
import { parseWebhookBody, verifyWebhookAuth } from "../services/helius";
import { enqueueWebhookTx } from "../queue";

export const webhookRoutes = new Elysia({ prefix: "/webhook" }).post(
  "/helius",
  async ({ request, set }) => {
    const authorization = request.headers.get("authorization");

    if (!verifyWebhookAuth(authorization)) {
      console.warn("[webhook] rejected: invalid Authorization header");
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const rawBody = await request.text();

    let payload: ReturnType<typeof parseWebhookBody>;

    try {
      payload = parseWebhookBody(JSON.parse(rawBody));
    } catch (error) {
      set.status = 400;
      return {
        error: error instanceof Error ? error.message : "Invalid webhook payload",
      };
    }

    let queued = 0;

    for (const tx of payload) {
      const address = await findMonitoredWalletForTx(tx);
      if (!address) {
        console.warn("[webhook] skipped tx without monitored wallet:", tx.signature);
        continue;
      }

      await enqueueWebhookTx(address, tx as unknown as Record<string, unknown>);
      queued += 1;
    }

    console.log(`[webhook] received ${payload.length} tx(s), queued ${queued}`);
    return { ok: true, queued };
  }
);
